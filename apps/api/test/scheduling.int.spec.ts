import type { INestApplication } from '@nestjs/common';
import type { CreateShiftRequest } from '@xrostr/contracts';
import pg from 'pg';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { seedTenant, seedUser, signIn, startApp } from './support/test-app.js';

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const PASSWORD = 'Scheduling-Password-2026';

describe('scheduling: rosters and my shifts', () => {
  const owner = new pg.Pool({ connectionString: inject('ownerUrl'), max: 1 });
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let tenant: Awaited<ReturnType<typeof seedTenant>>;
  let admin: string;
  let supervisor: string;
  let hr: string;
  let officerToken: string;
  let site: string;
  let sgSite: string;
  let officer: string;
  let sgOfficer: string;
  let officerUserId: string;

  const shift = (overrides: Partial<CreateShiftRequest> = {}): CreateShiftRequest => ({
    locationId: site,
    employeeId: officer,
    date: '2026-11-16',
    startTime: '20:00',
    durationHours: 12,
    kind: 'night',
    ...overrides,
  });

  beforeAll(async () => {
    tenant = await seedTenant(owner, 'roster-co');
    await seedUser(owner, tenant, 'tenant_admin', 'admin@roster.test', PASSWORD);
    await seedUser(owner, tenant, 'supervisor', 'spv@roster.test', PASSWORD);
    await seedUser(owner, tenant, 'hr', 'hr@roster.test', PASSWORD);
    ({ app, http } = await startApp());
    admin = await signIn(http, 'roster-co', 'admin@roster.test', PASSWORD);
    supervisor = await signIn(http, 'roster-co', 'spv@roster.test', PASSWORD);
    hr = await signIn(http, 'roster-co', 'hr@roster.test', PASSWORD);

    const createSite = async (code: string, entity: string, timezone: string) =>
      (
        await http
          .post('/tenant/locations')
          .set(bearer(admin))
          .send({
            name: `Site ${code}`,
            code,
            legalEntityId: entity,
            timezone,
            geofenceRadiusM: 150,
          })
          .expect(201)
      ).body.id as string;
    site = await createSite('BALI-01', tenant.idEntityId, 'Asia/Makassar');
    sgSite = await createSite('SG-01', tenant.sgEntityId, 'Asia/Singapore');

    const createEmployee = async (no: string, email: string, entity: string) => {
      const res = await http
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          fullName: `Officer ${no}`,
          email,
          employeeNo: no,
          legalEntityId: entity,
          employmentType: 'full_time',
          startDate: '2026-11-01',
          role: 'employee',
        })
        .expect(201);
      return { id: res.body.employeeId as string, invite: res.body.inviteToken as string };
    };
    const created = await createEmployee('SO-1', 'so1@roster.test', tenant.idEntityId);
    officer = created.id;
    sgOfficer = (await createEmployee('SG-1', 'sg1@roster.test', tenant.sgEntityId)).id;
    await http
      .post('/auth/accept-invite')
      .send({ inviteToken: created.invite, password: PASSWORD })
      .expect(200);
    officerToken = await signIn(http, 'roster-co', 'so1@roster.test', PASSWORD);
    officerUserId = (
      await owner.query<{ id: string }>(`select id from users where email = 'so1@roster.test'`)
    ).rows[0]!.id;
  });

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('stores a night shift in UTC and shows it in the site’s local time', async () => {
    const res = await http.post('/tenant/shifts').set(bearer(supervisor)).send(shift()).expect(201);
    // 20:00 WITA (UTC+8) on 16 Nov → 12:00Z, ends 08:00 local next day.
    expect(res.body).toMatchObject({
      status: 'draft',
      startsAt: '2026-11-16T12:00:00.000Z',
      endsAt: '2026-11-17T00:00:00.000Z',
      localDate: '2026-11-16',
      localStart: '20:00',
      localEnd: '08:00',
      timezone: 'Asia/Makassar',
      employee: { id: officer, employeeNo: 'SO-1' },
    });
  });

  it('refuses an overlapping shift for the same person', async () => {
    const res = await http
      .post('/tenant/shifts')
      .set(bearer(supervisor))
      .send(shift({ date: '2026-11-17', startTime: '06:00', durationHours: 8, kind: 'custom' }))
      .expect(409);
    expect(res.body.code).toBe('shift_overlap');
    // Back-to-back is fine: 08:00 starts exactly when the night shift ends.
    await http
      .post('/tenant/shifts')
      .set(bearer(supervisor))
      .send(shift({ date: '2026-11-17', startTime: '08:00', kind: 'day' }))
      .expect(201);
  });

  it('has the database refuse overlaps even when the check is bypassed', async () => {
    const existing = await owner.query(
      `select starts_at, ends_at, tenant_id, location_id from shifts where employee_id = $1 limit 1`,
      [officer],
    );
    const row = existing.rows[0]!;
    await expect(
      owner.query(
        `insert into shifts (id, tenant_id, location_id, employee_id, kind, status, starts_at, ends_at)
         values (gen_random_uuid(), $1, $2, $3, 'custom', 'draft', $4, $5)`,
        [row.tenant_id, row.location_id, officer, row.starts_at, row.ends_at],
      ),
    ).rejects.toThrow(/shifts_no_overlap/);
  });

  it('refuses a site of another legal entity and a shift over 24 hours', async () => {
    const entity = await http
      .post('/tenant/shifts')
      .set(bearer(supervisor))
      .send(shift({ locationId: sgSite, date: '2026-11-20' }))
      .expect(422);
    expect(entity.body.code).toBe('employee_other_entity');
    await http
      .post('/tenant/shifts')
      .set(bearer(supervisor))
      .send(shift({ date: '2026-11-21', durationHours: 25 }))
      .expect(422);
    await http
      .post('/tenant/shifts')
      .set(bearer(supervisor))
      .send(
        shift({
          locationId: sgSite,
          employeeId: sgOfficer,
          date: '2026-11-16',
          kind: 'day',
          startTime: '08:00',
        }),
      )
      .expect(201);
  });

  it('lets HR read the roster but not change it, and keeps officers out', async () => {
    const query = `/tenant/roster?locationId=${site}&from=2026-11-16&to=2026-11-22`;
    const roster = await http.get(query).set(bearer(hr)).expect(200);
    expect(roster.body.map((s: { localStart: string }) => s.localStart)).toEqual([
      '20:00',
      '08:00',
    ]);
    await http
      .post('/tenant/shifts')
      .set(bearer(hr))
      .send(shift({ date: '2026-11-25' }))
      .expect(403);
    await http.get(query).set(bearer(officerToken)).expect(403);
  });

  it('hides drafts from the officer until they are published, then notifies once', async () => {
    const mine = () =>
      http.get('/me/shifts?from=2026-11-16&to=2026-11-22').set(bearer(officerToken)).expect(200);
    expect((await mine()).body).toEqual([]);

    const published = await http
      .post('/tenant/roster/publish')
      .set(bearer(supervisor))
      .send({ locationId: site, from: '2026-11-16', to: '2026-11-22' })
      .expect(200);
    expect(published.body).toEqual({ published: 2, notified: 1 });

    const after = (await mine()).body;
    expect(after.map((s: { localDate: string; kind: string }) => [s.localDate, s.kind])).toEqual([
      ['2026-11-16', 'night'],
      ['2026-11-17', 'day'],
    ]);
    const notes = await owner.query(
      `select kind, title, body from notifications where user_id = $1`,
      [officerUserId],
    );
    expect(notes.rows).toEqual([
      expect.objectContaining({ kind: 'schedule.published', title: 'Jadwal baru terbit' }),
    ]);
    expect(notes.rows[0].body).toContain('2 shift di Site BALI-01');
  });

  it('cancels a published shift and tells the officer; deletes a draft silently', async () => {
    const roster = await http
      .get(`/tenant/roster?locationId=${site}&from=2026-11-16&to=2026-11-16`)
      .set(bearer(supervisor))
      .expect(200);
    await http.delete(`/tenant/shifts/${roster.body[0].id}`).set(bearer(supervisor)).expect(204);
    const again = await http
      .delete(`/tenant/shifts/${roster.body[0].id}`)
      .set(bearer(supervisor))
      .expect(409);
    expect(again.body.code).toBe('shift_already_cancelled');

    const notes = await owner.query(
      `select title from notifications where user_id = $1 and kind = 'schedule.cancelled'`,
      [officerUserId],
    );
    expect(notes.rowCount).toBe(1);

    // The freed slot can be planned again.
    const draft = await http
      .post('/tenant/shifts')
      .set(bearer(supervisor))
      .send(shift())
      .expect(201);
    await http.delete(`/tenant/shifts/${draft.body.id}`).set(bearer(supervisor)).expect(204);
    const gone = await owner.query('select 1 from shifts where id = $1', [draft.body.id]);
    expect(gone.rowCount).toBe(0);
  });

  it('keeps rosters private to their company', async () => {
    const other = await seedTenant(owner, 'roster-rival');
    await seedUser(owner, other, 'supervisor', 'spv@rival.test', PASSWORD);
    const rival = await signIn(http, 'roster-rival', 'spv@rival.test', PASSWORD);
    const res = await http
      .get(`/tenant/roster?locationId=${site}&from=2026-11-16&to=2026-11-22`)
      .set(bearer(rival))
      .expect(404);
    expect(res.body.code).toBe('location_not_found');
    await http
      .post('/tenant/shifts')
      .set(bearer(rival))
      .send(shift({ date: '2026-12-01' }))
      .expect(404);
  });
});
