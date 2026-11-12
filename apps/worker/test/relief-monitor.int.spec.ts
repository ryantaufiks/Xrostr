import { createDatabase, type DatabaseHandle } from '@xrostr/db';
import { migrateDatabase } from '@xrostr/db/migrate';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ReliefMonitor } from '../src/relief-monitor.js';

describe('ReliefMonitor', () => {
  let container: StartedPostgreSqlContainer;
  let owner: pg.Pool;
  let app: DatabaseHandle;
  let tenantId: string;
  let plannerId: string;
  let requestId: string;
  const users: Record<string, string> = {};
  const offers: Record<string, string> = {};
  const monitor = () => new ReliefMonitor(app.db, pino({ level: 'silent' }));

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
      `insert into tenants (id, name, slug, data_region, plan) values (gen_random_uuid(), 'R', 'relief-w', 'id', 'growth') returning id`,
      [],
    );
    const entity = await one(
      `insert into legal_entities (id, tenant_id, name, country_code) values (gen_random_uuid(), $1, 'PT R', 'ID') returning id`,
      [tenantId],
    );
    const site = await one(
      `insert into locations (id, tenant_id, legal_entity_id, name, code, timezone) values (gen_random_uuid(), $1, $2, 'Menara Sudirman', 'JKT-01', 'Asia/Jakarta') returning id`,
      [tenantId, entity],
    );
    const user = (email: string) =>
      one(
        `insert into users (id, tenant_id, email, full_name, status) values (gen_random_uuid(), $1, $2, $2, 'active') returning id`,
        [tenantId, email],
      );
    plannerId = await user('spv@relief.test');
    const employee = async (key: string) => {
      users[key] = await user(`${key}@relief.test`);
      return one(
        `insert into employees (id, tenant_id, user_id, legal_entity_id, employee_no, full_name, employment_type, start_date)
         values (gen_random_uuid(), $1, $2, $3, $4, $4, 'full_time', '2024-01-01') returning id`,
        [tenantId, users[key], entity, key],
      );
    };
    const original = await employee('orig');
    const first = await employee('first');
    const second = await employee('second');
    const shift = await one(
      `insert into shifts (id, tenant_id, location_id, employee_id, kind, status, starts_at, ends_at, timezone)
       values (gen_random_uuid(), $1, $2, $3, 'night', 'published', now() + interval '2 hours', now() + interval '14 hours', 'Asia/Jakarta') returning id`,
      [tenantId, site, original],
    );
    requestId = await one(
      `insert into relief_requests (id, tenant_id, shift_id, location_id, starts_at, ends_at, requested_by, timeout_minutes)
       select gen_random_uuid(), $1, s.id, s.location_id, s.starts_at, s.ends_at, $2, 15 from shifts s where s.id = $3 returning id`,
      [tenantId, plannerId, shift],
    );
    // The first offer has already run out; the second is waiting in the queue.
    offers.first = await one(
      `insert into relief_offers (id, tenant_id, request_id, employee_id, position, status, offered_at, expires_at)
       values (gen_random_uuid(), $1, $2, $3, 1, 'offered', now() - interval '20 minutes', now() - interval '5 minutes') returning id`,
      [tenantId, requestId, first],
    );
    offers.second = await one(
      `insert into relief_offers (id, tenant_id, request_id, employee_id, position) values (gen_random_uuid(), $1, $2, $3, 2) returning id`,
      [tenantId, requestId, second],
    );
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await owner?.end();
    await container?.stop();
  });

  const statuses = async () =>
    Object.fromEntries(
      (await owner.query(`select id, status from relief_offers`)).rows.map((r) => [r.id, r.status]),
    );

  it('expires an unanswered offer and offers the next candidate', async () => {
    expect(await monitor().tick()).toBe(1);
    expect(await statuses()).toEqual({ [offers.first!]: 'expired', [offers.second!]: 'offered' });
    const note = await owner.query(
      `select title, body from notifications where user_id = $1 and kind = 'relief.offered'`,
      [users.second],
    );
    expect(note.rows[0].title).toBe('Tawaran shift pengganti');
    expect(note.rows[0].body).toMatch(
      /^Menara Sudirman, .+ \d{2}\.\d{2}–\d{2}\.\d{2}\. Jawab dalam 15 menit\.$/,
    );
    expect(await monitor().tick()).toBe(0);
  });

  it('closes the search as unfilled when the last offer runs out, and tells the planner', async () => {
    await owner.query(
      `update relief_offers set expires_at = now() - interval '1 minute' where id = $1`,
      [offers.second],
    );
    expect(await monitor().tick()).toBe(1);
    const request = await owner.query(
      `select status, closed_at from relief_requests where id = $1`,
      [requestId],
    );
    expect(request.rows[0].status).toBe('unfilled');
    expect(request.rows[0].closed_at).not.toBeNull();
    const note = await owner.query(
      `select title from notifications where user_id = $1 and kind = 'relief.unfilled'`,
      [plannerId],
    );
    expect(note.rows).toEqual([{ title: 'Pengganti tidak didapat' }]);
    expect(await monitor().tick()).toBe(0);
  });
});
