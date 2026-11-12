import { createDatabase, type DatabaseHandle } from '@xrostr/db';
import { migrateDatabase } from '@xrostr/db/migrate';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SafetyMonitor } from '../src/safety-monitor.js';

const MINUTE = 60_000;

describe('SafetyMonitor', () => {
  let container: StartedPostgreSqlContainer;
  let owner: pg.Pool;
  let app: DatabaseHandle;
  let tenantId: string;
  let supervisorId: string;
  let officerUserId: string;
  let lateRoundId: string;
  const monitor = () => new SafetyMonitor(app.db, pino({ level: 'silent' }));

  const one = async (text: string, values: unknown[]) =>
    (await owner.query<{ id: string }>(text, values)).rows[0]!.id;
  const at = (minutes: number) => new Date(Date.now() + minutes * MINUTE);

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
      `insert into tenants (id, name, slug, data_region, plan) values (gen_random_uuid(), 'Safe', 'safe', 'sg', 'growth') returning id`,
      [],
    );
    const entity = await one(
      `insert into legal_entities (id, tenant_id, name, country_code) values (gen_random_uuid(), $1, 'Safe Pte Ltd', 'SG') returning id`,
      [tenantId],
    );
    // Welfare checks every 30 minutes at this site.
    const site = await one(
      `insert into locations (id, tenant_id, legal_entity_id, name, code, timezone, welfare_interval_minutes)
       values (gen_random_uuid(), $1, $2, 'Marina Tower', 'SG-01', 'Asia/Singapore', 30) returning id`,
      [tenantId, entity],
    );
    const role = (key: string, permissions: string[]) =>
      one(
        `insert into roles (id, tenant_id, key, name, permissions) values (gen_random_uuid(), $1, $2, $2, $3) returning id`,
        [tenantId, key, permissions],
      );
    const supervisorRole = await role('supervisor', ['alerts.respond']);
    const employeeRole = await role('employee', []);
    const user = async (email: string, roleId: string) => {
      const id = await one(
        `insert into users (id, tenant_id, email, full_name, status) values (gen_random_uuid(), $1, $2, $2, 'active') returning id`,
        [tenantId, email],
      );
      await owner.query(
        `insert into user_roles (tenant_id, user_id, role_id) values ($1, $2, $3)`,
        [tenantId, id, roleId],
      );
      return id;
    };
    supervisorId = await user('spv@safe.test', supervisorRole);
    officerUserId = await user('so@safe.test', employeeRole);
    const employee = await one(
      `insert into employees (id, tenant_id, user_id, legal_entity_id, location_id, employee_no, full_name, employment_type, start_date)
       values (gen_random_uuid(), $1, $2, $3, $4, 'SO-1', 'Officer Tan', 'full_time', '2025-01-01') returning id`,
      [tenantId, officerUserId, entity, site],
    );
    // On shift for 90 minutes, checked in 80 minutes ago.
    const shift = await one(
      `insert into shifts (id, tenant_id, location_id, employee_id, kind, status, starts_at, ends_at)
       values (gen_random_uuid(), $1, $2, $3, 'custom', 'published', $4, $5) returning id`,
      [tenantId, site, employee, at(-90), at(390)],
    );
    await owner.query(
      `insert into attendance_events (id, tenant_id, employee_id, shift_id, location_id, kind, occurred_at, latitude, longitude, distance_m)
       values (gen_random_uuid(), $1, $2, $3, $4, 'check_in', $5, 0, 0, 5)`,
      [tenantId, employee, shift, site, at(-80)],
    );
    // An hourly route with no round yet in this shift: 80 > 60 + 10 minutes, so it is overdue.
    await one(
      `insert into patrol_routes (id, tenant_id, location_id, name, interval_minutes) values (gen_random_uuid(), $1, $2, 'Perimeter', 60) returning id`,
      [tenantId, site],
    );
    // A round still open from yesterday's shift, which ended long ago.
    const yesterday = await one(
      `insert into shifts (id, tenant_id, location_id, employee_id, kind, status, starts_at, ends_at)
       values (gen_random_uuid(), $1, $2, $3, 'custom', 'published', $4, $5) returning id`,
      [tenantId, site, employee, at(-1440), at(-960)],
    );
    const oldRoute = await one(
      `insert into patrol_routes (id, tenant_id, location_id, name) values (gen_random_uuid(), $1, $2, 'Lobby') returning id`,
      [tenantId, site],
    );
    lateRoundId = await one(
      `insert into patrol_rounds (id, tenant_id, route_id, employee_id, shift_id, started_at, checkpoint_count)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, 3) returning id`,
      [tenantId, oldRoute, employee, yesterday, at(-1000)],
    );
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await owner?.end();
    await container?.stop();
  });

  it('asks, raises late patrols and closes stale rounds on the first pass', async () => {
    expect(await monitor().tick()).toEqual({ prompted: 1, escalated: 0, overdue: 1, closed: 1 });

    const checks = await owner.query(
      `select respond_by - prompted_at as window from welfare_checks`,
    );
    expect(checks.rows[0].window).toMatchObject({ minutes: 10 });
    const notes = await owner.query(`select user_id, kind, title from notifications order by kind`);
    expect(notes.rows).toEqual([
      expect.objectContaining({
        user_id: supervisorId,
        kind: 'alert.patrol_overdue',
        title: 'Patrol overdue',
      }),
      expect.objectContaining({ user_id: officerUserId, kind: 'patrol.overdue' }),
      // The Singapore tenant reads English by default.
      expect.objectContaining({
        user_id: officerUserId,
        kind: 'welfare.check',
        title: 'Are you OK?',
      }),
    ]);
    const round = await owner.query(`select status, finished_at from patrol_rounds where id = $1`, [
      lateRoundId,
    ]);
    expect(round.rows[0]).toMatchObject({ status: 'incomplete' });
  });

  it('does not repeat itself while nothing changes', async () => {
    expect(await monitor().tick()).toEqual({ prompted: 0, escalated: 0, overdue: 0, closed: 0 });
  });

  it('alerts supervisors once when a check goes unanswered', async () => {
    await owner.query(`update welfare_checks set respond_by = now() - interval '1 minute'`);
    expect((await monitor().tick()).escalated).toBe(1);
    expect((await monitor().tick()).escalated).toBe(0);

    const raised = await owner.query(`select kind, status from alerts order by kind`);
    expect(raised.rows).toEqual([
      { kind: 'patrol_overdue', status: 'open' },
      { kind: 'welfare_missed', status: 'open' },
    ]);
    const note = await owner.query(
      `select title from notifications where user_id = $1 and kind = 'alert.welfare_missed'`,
      [supervisorId],
    );
    expect(note.rows[0].title).toBe('Officer Tan did not answer');
  });

  it('asks again only after an answer and a full interval', async () => {
    await owner.query(
      `update welfare_checks set responded_at = now(), prompted_at = now() - interval '31 minutes'`,
    );
    expect((await monitor().tick()).prompted).toBe(1);
    expect((await monitor().tick()).prompted).toBe(0);
  });
});
