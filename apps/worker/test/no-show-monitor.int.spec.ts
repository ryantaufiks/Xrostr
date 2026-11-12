import { createDatabase, type DatabaseHandle } from '@xrostr/db';
import { migrateDatabase } from '@xrostr/db/migrate';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NoShowMonitor } from '../src/no-show-monitor.js';

const MINUTE = 60_000;

describe('NoShowMonitor', () => {
  let container: StartedPostgreSqlContainer;
  let owner: pg.Pool;
  let app: DatabaseHandle;
  let tenantId: string;
  let plannerId: string;
  let dueOfficerUserId: string;
  const shiftIds: Record<string, string> = {};

  const one = async (text: string, values: unknown[]) =>
    (await owner.query<{ id: string }>(text, values)).rows[0]!.id;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine')
      .withUsername('xrostr_owner')
      .start();
    await migrateDatabase({ ownerUrl: container.getConnectionUri(), appPassword: 'app' });
    owner = new pg.Pool({ connectionString: container.getConnectionUri(), max: 1 });
    const appUrl = new URL(container.getConnectionUri());
    appUrl.username = 'xrostr_app';
    appUrl.password = 'app';
    app = createDatabase(appUrl.toString(), { max: 2 });

    tenantId = await one(
      `insert into tenants (id, name, slug, data_region, plan) values (gen_random_uuid(), 'NS', 'ns', 'id', 'growth') returning id`,
      [],
    );
    const entity = await one(
      `insert into legal_entities (id, tenant_id, name, country_code) values (gen_random_uuid(), $1, 'PT NS', 'ID') returning id`,
      [tenantId],
    );
    const site = await one(
      `insert into locations (id, tenant_id, legal_entity_id, name, code, timezone) values (gen_random_uuid(), $1, $2, 'Pelabuhan Benoa', 'BALI-01', 'Asia/Makassar') returning id`,
      [tenantId, entity],
    );
    const role = (key: string, permissions: string[]) =>
      one(
        `insert into roles (id, tenant_id, key, name, permissions) values (gen_random_uuid(), $1, $2, $2, $3) returning id`,
        [tenantId, key, permissions],
      );
    const supervisorRole = await role('supervisor', ['schedules.read', 'schedules.manage']);
    const employeeRole = await role('employee', []);
    const user = async (email: string, roleId: string, status = 'active') => {
      const id = await one(
        `insert into users (id, tenant_id, email, full_name, status) values (gen_random_uuid(), $1, $2, $2, $3) returning id`,
        [tenantId, email, status],
      );
      await owner.query(
        `insert into user_roles (tenant_id, user_id, role_id) values ($1, $2, $3)`,
        [tenantId, id, roleId],
      );
      return id;
    };
    plannerId = await user('spv@ns.test', supervisorRole);
    await user('old-spv@ns.test', supervisorRole, 'disabled');

    // One officer per case, so their shifts never overlap.
    const now = Date.now();
    const cases: Record<
      string,
      { startOffset: number; endOffset: number; status: string; checkedIn?: boolean }
    > = {
      due: { startOffset: -20, endOffset: 220, status: 'published' },
      checkedIn: { startOffset: -30, endOffset: 210, status: 'published', checkedIn: true },
      fresh: { startOffset: -5, endOffset: 235, status: 'published' },
      draft: { startOffset: -30, endOffset: 210, status: 'draft' },
      ended: { startOffset: -240, endOffset: -1, status: 'published' },
    };
    for (const [name, c] of Object.entries(cases)) {
      const userId = await user(`${name}@ns.test`, employeeRole);
      if (name === 'due') dueOfficerUserId = userId;
      const employee = await one(
        `insert into employees (id, tenant_id, user_id, legal_entity_id, location_id, employee_no, full_name, employment_type, start_date)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'full_time', '2026-11-01') returning id`,
        [tenantId, userId, entity, site, name.toUpperCase(), `Officer ${name}`],
      );
      shiftIds[name] = await one(
        `insert into shifts (id, tenant_id, location_id, employee_id, kind, status, starts_at, ends_at)
         values (gen_random_uuid(), $1, $2, $3, 'custom', $4, $5, $6) returning id`,
        [
          tenantId,
          site,
          employee,
          c.status,
          new Date(now + c.startOffset * MINUTE),
          new Date(now + c.endOffset * MINUTE),
        ],
      );
      if (c.checkedIn) {
        await owner.query(
          `insert into attendance_events (id, tenant_id, employee_id, shift_id, location_id, kind, occurred_at, latitude, longitude, distance_m)
           values (gen_random_uuid(), $1, $2, $3, $4, 'check_in', now(), 0, 0, 10)`,
          [tenantId, employee, shiftIds[name], site],
        );
      }
    }
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await owner?.end();
    await container?.stop();
  });

  it('reports only running, published shifts without a check-in after the grace period', async () => {
    const monitor = new NoShowMonitor(app.db, pino({ level: 'silent' }));
    expect(await monitor.tick()).toBe(1);

    const alerted = await owner.query(`select id from shifts where no_show_alerted_at is not null`);
    expect(alerted.rows.map((r) => r.id)).toEqual([shiftIds.due]);

    const notes = await owner.query(`select user_id, kind, body from notifications order by kind`);
    expect(notes.rows).toEqual([
      expect.objectContaining({ user_id: plannerId, kind: 'attendance.no_show' }),
      expect.objectContaining({ user_id: dueOfficerUserId, kind: 'attendance.reminder' }),
    ]);
    expect(notes.rows[0].body).toMatch(/^Officer due, shift \d{2}\.\d{2} di Pelabuhan Benoa/);

    const queued = await owner.query(
      `select count(*)::int as n from outbox_events where type = 'notification.created'`,
    );
    expect(queued.rows[0].n).toBe(2);
  });

  it('reports each shift only once', async () => {
    const monitor = new NoShowMonitor(app.db, pino({ level: 'silent' }));
    expect(await monitor.tick()).toBe(0);
    const notes = await owner.query(`select count(*)::int as n from notifications`);
    expect(notes.rows[0].n).toBe(2);
  });
});
