import type { INestApplication } from '@nestjs/common';
import type { ReliefCandidate } from '@xrostr/contracts';
import pg from 'pg';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { seedTenant, seedUser, signIn, startApp } from './support/test-app.js';

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const PASSWORD = 'Relief-Password-2026';
const TZ = 'Asia/Jakarta';
const HOUR = 3_600_000;

describe('relief: finding and offering a replacement', () => {
  const owner = new pg.Pool({ connectionString: inject('ownerUrl'), max: 1 });
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let tenant: Awaited<ReturnType<typeof seedTenant>>;
  let admin: string;
  let adminUserId: string;
  let site: string;
  let zone: string;
  const people: Record<string, { id: string; token: string; userId: string }> = {};
  let futureShift: string;

  /** A shift row written directly, so tests can place it anywhere in time. */
  const insertShift = async (
    employeeId: string,
    startOffsetH: number,
    hours: number,
    extra: {
      kind?: string;
      status?: string;
      zoneId?: string | null;
      locationId?: string | null;
    } = {},
  ) =>
    (
      await owner.query<{ id: string }>(
        `insert into shifts (id, tenant_id, location_id, zone_id, employee_id, kind, status, starts_at, ends_at, timezone)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
        [
          tenant.tenantId,
          extra.locationId === undefined ? site : extra.locationId,
          extra.zoneId ?? null,
          employeeId,
          extra.kind ?? 'custom',
          extra.status ?? 'published',
          new Date(Date.now() + startOffsetH * HOUR),
          new Date(Date.now() + (startOffsetH + hours) * HOUR),
          TZ,
        ],
      )
    ).rows[0]!.id;

  const notesOf = (userId: string, kind: string) =>
    owner.query(`select title, body from notifications where user_id = $1 and kind = $2`, [
      userId,
      kind,
    ]);

  beforeAll(async () => {
    tenant = await seedTenant(owner, 'relief-co');
    await seedUser(owner, tenant, 'tenant_admin', 'admin@relief.test', PASSWORD);
    ({ app, http } = await startApp());
    admin = await signIn(http, 'relief-co', 'admin@relief.test', PASSWORD);
    adminUserId = (
      await owner.query<{ id: string }>(`select id from users where email = 'admin@relief.test'`)
    ).rows[0]!.id;

    site = (
      await http
        .post('/tenant/locations')
        .set(bearer(admin))
        .send({
          name: 'Menara Sudirman',
          code: 'JKT-01',
          legalEntityId: tenant.idEntityId,
          timezone: TZ,
          latitude: -6.2,
          longitude: 106.8,
          geofenceRadiusM: 150,
        })
        .expect(201)
    ).body.id;
    zone = (
      await http
        .post('/tenant/zones')
        .set(bearer(admin))
        .send({ name: 'Cluster Sudirman', locationIds: [site] })
        .expect(201)
    ).body.id;

    const hire = async (key: string, extra: Record<string, unknown>) => {
      const email = `${key.toLowerCase()}@relief.test`;
      const res = await http
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          fullName: `Officer ${key}`,
          email,
          employeeNo: key.toUpperCase(),
          legalEntityId: tenant.idEntityId,
          employmentType: 'full_time',
          startDate: '2024-01-01',
          role: 'employee',
          ...extra,
        })
        .expect(201);
      await http
        .post('/auth/accept-invite')
        .send({ inviteToken: res.body.inviteToken, password: PASSWORD })
        .expect(200);
      const userId = (
        await owner.query<{ id: string }>(`select id from users where email = $1`, [email])
      ).rows[0]!.id;
      people[key] = {
        id: res.body.employeeId,
        token: await signIn(http, 'relief-co', email, PASSWORD),
        userId,
      };
    };
    await hire('orig', { locationId: site });
    await hire('rover', { assignmentType: 'roving' });
    await hire('standby', {});
    await hire('offduty', { canRelieve: true });
    await hire('tired', { canRelieve: true });
    await hire('away', { canRelieve: true });
    await hire('bystander', {});

    // The shift to cover: in 20 hours, for 8 hours.
    futureShift = await insertShift(people.orig!.id, 20, 8);
    await insertShift(people.rover!.id, 18, 12, { locationId: null, zoneId: zone });
    await insertShift(people.standby!.id, 18, 12, { kind: 'standby', locationId: null });
    // Ends two hours before the window: too little rest.
    await insertShift(people.tired!.id, 10, 8);
    const leaveDay = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(
      new Date(Date.now() + 22 * HOUR),
    );
    await owner.query(
      `insert into leave_requests (id, tenant_id, employee_id, leave_type, start_date, end_date, days, status)
       values (gen_random_uuid(), $1, $2, 'annual', $3, $3, 1, 'approved')`,
      [tenant.tenantId, people.away!.id, leaveDay],
    );
  });

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('ranks the roving officer nearby, then standby, then off duty, leaving out the rest', async () => {
    const res = await http
      .get(`/tenant/shifts/${futureShift}/relief/candidates`)
      .set(bearer(admin))
      .expect(200);
    expect(res.body.map((c: ReliefCandidate) => [c.employee.employeeNo, c.priority])).toEqual([
      ['ROVER', 'roving'],
      ['STANDBY', 'standby'],
      ['OFFDUTY', 'off_duty'],
    ]);
    await http
      .get(`/tenant/shifts/${futureShift}/relief/candidates`)
      .set(bearer(people.orig!.token))
      .expect(403);
  });

  it('only covers published site shifts that have not ended', async () => {
    const draft = await insertShift(people.bystander!.id, 50, 8, { status: 'draft' });
    const res = await http
      .get(`/tenant/shifts/${draft}/relief/candidates`)
      .set(bearer(admin))
      .expect(422);
    expect(res.body.code).toBe('relief_shift_not_eligible');
  });

  it('offers the first chosen candidate and allows one open search per shift', async () => {
    const res = await http
      .post(`/tenant/shifts/${futureShift}/relief`)
      .set(bearer(admin))
      .send({ employeeIds: [people.offduty!.id, people.standby!.id, people.tired!.id] })
      .expect(201);
    // The tired officer does not qualify and is dropped.
    expect(
      res.body.offers.map((o: { employee: { fullName: string }; status: string }) => [
        o.employee.fullName,
        o.status,
      ]),
    ).toEqual([
      ['Officer offduty', 'offered'],
      ['Officer standby', 'queued'],
    ]);
    expect((await notesOf(people.offduty!.userId, 'relief.offered')).rows[0].body).toContain(
      'Menara Sudirman',
    );
    const again = await http
      .post(`/tenant/shifts/${futureShift}/relief`)
      .set(bearer(admin))
      .send({ employeeIds: [people.rover!.id] })
      .expect(409);
    expect(again.body.code).toBe('relief_already_open');
  });

  it('moves on to the next candidate when one declines', async () => {
    const [offer] = (await http.get('/me/relief').set(bearer(people.offduty!.token)).expect(200))
      .body;
    await http
      .post(`/me/relief/${offer.id}/decline`)
      .set(bearer(people.offduty!.token))
      .expect(204);
    await http
      .post(`/me/relief/${offer.id}/decline`)
      .set(bearer(people.offduty!.token))
      .expect(409);
    expect(
      (await http.get('/me/relief').set(bearer(people.offduty!.token)).expect(200)).body,
    ).toEqual([]);
    const next = (await http.get('/me/relief').set(bearer(people.standby!.token)).expect(200)).body;
    expect(next).toEqual([
      expect.objectContaining({
        status: 'offered',
        location: expect.objectContaining({ name: 'Menara Sudirman' }),
      }),
    ]);
  });

  it('gives the accepting officer the shift and cancels the original', async () => {
    const [offer] = (await http.get('/me/relief').set(bearer(people.standby!.token)).expect(200))
      .body;
    // Someone else cannot take another officer's offer.
    await http
      .post(`/me/relief/${offer.id}/accept`)
      .set(bearer(people.bystander!.token))
      .expect(404);
    const res = await http
      .post(`/me/relief/${offer.id}/accept`)
      .set(bearer(people.standby!.token))
      .expect(200);
    expect(res.body.status).toBe('accepted');

    const rows = await owner.query(
      `select employee_id, status, kind, replaces_shift_id from shifts where id = $1 or replaces_shift_id = $1 order by created_at`,
      [futureShift],
    );
    expect(rows.rows).toEqual([
      expect.objectContaining({ employee_id: people.orig!.id, status: 'cancelled' }),
      expect.objectContaining({
        employee_id: people.standby!.id,
        status: 'published',
        replaces_shift_id: futureShift,
      }),
    ]);
    // The standby shift stays: on call and at work may overlap.
    const standby = await owner.query(
      `select status from shifts where employee_id = $1 and kind = 'standby'`,
      [people.standby!.id],
    );
    expect(standby.rows[0].status).toBe('published');

    const list = await http
      .get(`/tenant/relief?status=all&locationId=${site}`)
      .set(bearer(admin))
      .expect(200);
    expect(list.body[0]).toMatchObject({
      status: 'filled',
      filledBy: { fullName: 'Officer standby' },
    });
    expect((await notesOf(adminUserId, 'relief.filled')).rowCount).toBe(1);
    expect((await notesOf(people.orig!.userId, 'relief.replaced')).rowCount).toBe(1);
  });

  it('takes a roving officer off their zone for the rest of a running shift', async () => {
    const running = await insertShift(people.bystander!.id, -1, 6);
    const rovingShift = await insertShift(people.rover!.id, -2, 10, {
      locationId: null,
      zoneId: zone,
    });
    await http
      .post(`/tenant/shifts/${running}/relief`)
      .set(bearer(admin))
      .send({ employeeIds: [people.rover!.id] })
      .expect(201);
    const [offer] = (await http.get('/me/relief').set(bearer(people.rover!.token)).expect(200))
      .body;
    await http.post(`/me/relief/${offer.id}/accept`).set(bearer(people.rover!.token)).expect(200);

    const shift = async (id: string) =>
      (await owner.query(`select status, ends_at from shifts where id = $1`, [id])).rows[0];
    const now = Date.now();
    // Both earlier shifts end about now instead of being cancelled: the hours already worked stay.
    for (const id of [running, rovingShift]) {
      const s = await shift(id);
      expect(s.status).toBe('published');
      expect(Math.abs(new Date(s.ends_at).getTime() - now)).toBeLessThan(2 * 60_000);
    }
    const relief = await owner.query(
      `select starts_at, kind from shifts where replaces_shift_id = $1`,
      [running],
    );
    expect(relief.rows[0].kind).toBe('custom');
    expect(Math.abs(new Date(relief.rows[0].starts_at).getTime() - now)).toBeLessThan(2 * 60_000);
  });

  it('refuses expired offers and cancelled searches', async () => {
    const shift = await insertShift(people.bystander!.id, 30, 8);
    const sent = (
      await http
        .post(`/tenant/shifts/${shift}/relief`)
        .set(bearer(admin))
        .send({ employeeIds: [people.offduty!.id] })
        .expect(201)
    ).body;
    const offerId = (
      await owner.query<{ id: string }>(`select id from relief_offers where request_id = $1`, [
        sent.id,
      ])
    ).rows[0]!.id;
    await owner.query(
      `update relief_offers set expires_at = now() - interval '1 minute' where id = $1`,
      [offerId],
    );
    const expired = await http
      .post(`/me/relief/${offerId}/accept`)
      .set(bearer(people.offduty!.token))
      .expect(409);
    expect(expired.body.code).toBe('relief_offer_closed');

    await owner.query(
      `update relief_offers set expires_at = now() + interval '10 minutes' where id = $1`,
      [offerId],
    );
    await http.post(`/tenant/relief/${sent.id}/cancel`).set(bearer(admin)).expect(204);
    await http.post(`/me/relief/${offerId}/accept`).set(bearer(people.offduty!.token)).expect(409);
    await http.post(`/tenant/relief/${sent.id}/cancel`).set(bearer(admin)).expect(409);
  });

  it('keeps relief private to its company', async () => {
    const rival = await seedTenant(owner, 'relief-rival');
    await seedUser(owner, rival, 'tenant_admin', 'admin@rival-relief.test', PASSWORD);
    const rivalAdmin = await signIn(http, 'relief-rival', 'admin@rival-relief.test', PASSWORD);
    expect(
      (await http.get('/tenant/relief?status=all').set(bearer(rivalAdmin)).expect(200)).body,
    ).toEqual([]);
    await http
      .get(`/tenant/shifts/${futureShift}/relief/candidates`)
      .set(bearer(rivalAdmin))
      .expect(404);
  });
});
