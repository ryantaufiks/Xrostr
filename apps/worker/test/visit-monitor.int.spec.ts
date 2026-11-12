import { createDatabase, type DatabaseHandle } from '@xrostr/db';
import { migrateDatabase } from '@xrostr/db/migrate';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VisitMonitor } from '../src/visit-monitor.js';

describe('VisitMonitor', () => {
  let container: StartedPostgreSqlContainer;
  let owner: pg.Pool;
  let app: DatabaseHandle;
  let tenantId: string;
  let plannerId: string;
  const users: Record<string, string> = {};
  const monitor = () => new VisitMonitor(app.db, pino({ level: 'silent' }));

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
      `insert into tenants (id, name, slug, data_region, plan) values (gen_random_uuid(), 'V', 'visits-w', 'id', 'growth') returning id`,
      [],
    );
    const entity = await one(
      `insert into legal_entities (id, tenant_id, name, country_code) values (gen_random_uuid(), $1, 'PT V', 'ID') returning id`,
      [tenantId],
    );
    const site = (name: string, code: string) =>
      one(
        `insert into locations (id, tenant_id, legal_entity_id, name, code, timezone) values (gen_random_uuid(), $1, $2, $3, $4, 'Asia/Jakarta') returning id`,
        [tenantId, entity, name, code],
      );
    const siteA = await site('Gudang Cakung', 'A-01');
    const siteB = await site('Menara Sudirman', 'B-01');
    const siteC = await site('Ruko Kemang', 'C-01');
    const zone = await one(
      `insert into zones (id, tenant_id, name, visit_gap_minutes) values (gen_random_uuid(), $1, 'Jakarta Timur', 60) returning id`,
      [tenantId],
    );
    for (const [locationId, minVisits] of [
      [siteA, 2],
      [siteB, 1],
      [siteC, 0],
    ] as const) {
      await owner.query(
        `insert into zone_locations (tenant_id, zone_id, location_id, min_visits) values ($1, $2, $3, $4)`,
        [tenantId, zone, locationId, minVisits],
      );
    }

    const role = await one(
      `insert into roles (id, tenant_id, key, name, permissions) values (gen_random_uuid(), $1, 'supervisor', 'supervisor', $2) returning id`,
      [tenantId, ['schedules.read', 'schedules.manage']],
    );
    const user = (email: string) =>
      one(
        `insert into users (id, tenant_id, email, full_name, status) values (gen_random_uuid(), $1, $2, $2, 'active') returning id`,
        [tenantId, email],
      );
    plannerId = await user('spv@visits.test');
    await owner.query(`insert into user_roles (tenant_id, user_id, role_id) values ($1, $2, $3)`, [
      tenantId,
      plannerId,
      role,
    ]);
    const employee = async (key: string) => {
      users[key] = await user(`${key}@visits.test`);
      return one(
        `insert into employees (id, tenant_id, user_id, legal_entity_id, employee_no, full_name, employment_type, start_date)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, 'full_time', '2024-01-01') returning id`,
        [tenantId, users[key], entity, key, `Pak ${key}`],
      );
    };
    const shift = (employeeId: string, startsAgo: string, endsIn: string) =>
      one(
        `insert into shifts (id, tenant_id, zone_id, employee_id, kind, status, starts_at, ends_at, timezone)
         values (gen_random_uuid(), $1, $2, $3, 'custom', 'published', now() - $4::interval, now() + $5::interval, 'Asia/Jakarta') returning id`,
        [tenantId, zone, employeeId, startsAgo, endsIn],
      );
    const touch = (
      table: 'attendance_events' | 'site_visits',
      s: string,
      e: string,
      l: string,
      ago: string,
    ) =>
      owner.query(
        table === 'attendance_events'
          ? `insert into attendance_events (id, tenant_id, employee_id, shift_id, location_id, kind, occurred_at, latitude, longitude, distance_m)
             values (gen_random_uuid(), $1, $2, $3, $4, 'check_in', now() - $5::interval, 0, 0, 5)`
          : `insert into site_visits (id, tenant_id, employee_id, shift_id, location_id, occurred_at, latitude, longitude, distance_m)
             values (gen_random_uuid(), $1, $2, $3, $4, now() - $5::interval, 0, 0, 5)`,
        [tenantId, e, s, l, ago],
      );

    // Ends in 30 minutes: site B is done, site A has 1 of 2 visits and no time for another.
    const late = await employee('late');
    const lateShift = await shift(late, '7 hours 30 minutes', '30 minutes');
    await touch('attendance_events', lateShift, late, siteB, '7 hours');
    await touch('site_visits', lateShift, late, siteA, '3 hours');
    // Plenty of time left for both visits at site A.
    const early = await employee('early');
    const earlyShift = await shift(early, '1 hour', '7 hours');
    await touch('attendance_events', earlyShift, early, siteB, '50 minutes');
    // Never checked in: the no-show monitor's business, not this one's.
    const absent = await employee('absent');
    await shift(absent, '7 hours', '20 minutes');
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await owner?.end();
    await container?.stop();
  });

  const notes = (userId: string, kind: string) =>
    owner.query<{ title: string; body: string }>(
      `select title, body from notifications where user_id = $1 and kind = $2`,
      [userId, kind],
    );

  it('warns planners and the officer once when a site can no longer reach its target', async () => {
    expect(await monitor().tick()).toBe(1);

    const planner = (await notes(plannerId, 'visits.behind')).rows;
    expect(planner).toHaveLength(1);
    expect(planner[0]!.title).toBe('Kunjungan roving tertinggal');
    expect(planner[0]!.body).toMatch(
      /^Pak late \(Jakarta Timur\): 1 dari 2 kunjungan di Gudang Cakung, shift berakhir \d{2}\.\d{2}\.$/,
    );
    const officer = (await notes(users.late!, 'visits.reminder')).rows;
    expect(officer.map((n) => n.title)).toEqual(['Kunjungi Gudang Cakung']);
    for (const key of ['early', 'absent']) {
      expect((await notes(users[key]!, 'visits.reminder')).rows).toHaveLength(0);
    }
    const outbox = await owner.query(
      `select count(*)::int as n from outbox_events where type = 'notification.created'`,
    );
    expect(outbox.rows[0].n).toBe(2);

    expect(await monitor().tick()).toBe(0);
  });
});
