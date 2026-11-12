import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { seedTenant, seedUser, signIn, startApp } from './support/test-app.js';

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const PASSWORD = 'Attendance-Password-2026';
const SITE = { latitude: -8.7457, longitude: 115.2149 };
const TZ = 'Asia/Makassar';

/** Local date and HH:MM at the site, `offsetMinutes` from now. */
function siteClock(offsetMinutes: number): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(Date.now() + offsetMinutes * 60_000))
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

describe('attendance: QR + GPS check-in and check-out', () => {
  const owner = new pg.Pool({ connectionString: inject('ownerUrl'), max: 1 });
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let officerToken: string;
  let idleToken: string;
  let siteId: string;
  let code: string;
  let officerId: string;

  const scan = (token: string, body: Record<string, unknown>) =>
    http
      .post('/me/attendance')
      .set(bearer(token))
      .send({ locationId: siteId, code, ...body });

  beforeAll(async () => {
    const tenant = await seedTenant(owner, 'absen-co');
    await seedUser(owner, tenant, 'tenant_admin', 'admin@absen.test', PASSWORD);
    ({ app, http } = await startApp());
    admin = await signIn(http, 'absen-co', 'admin@absen.test', PASSWORD);

    siteId = (
      await http
        .post('/tenant/locations')
        .set(bearer(admin))
        .send({
          name: 'Pelabuhan Benoa',
          code: 'BALI-01',
          legalEntityId: tenant.idEntityId,
          timezone: TZ,
          ...SITE,
          geofenceRadiusM: 150,
        })
        .expect(201)
    ).body.id;

    const hire = async (no: string, email: string) => {
      const res = await http
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          fullName: `Officer ${no}`,
          email,
          employeeNo: no,
          legalEntityId: tenant.idEntityId,
          locationId: siteId,
          employmentType: 'full_time',
          startDate: '2026-11-01',
          role: 'employee',
        })
        .expect(201);
      await http
        .post('/auth/accept-invite')
        .send({ inviteToken: res.body.inviteToken, password: PASSWORD })
        .expect(200);
      return {
        id: res.body.employeeId as string,
        token: await signIn(http, 'absen-co', email, PASSWORD),
      };
    };
    const officer = await hire('SO-1', 'so1@absen.test');
    officerId = officer.id;
    officerToken = officer.token;
    idleToken = (await hire('SO-2', 'so2@absen.test')).token;

    // A published shift that began 20 minutes ago.
    const started = siteClock(-20);
    await http
      .post('/tenant/shifts')
      .set(bearer(admin))
      .send({
        locationId: siteId,
        employeeId: officerId,
        ...{ date: started.date, startTime: started.time },
        durationHours: 4,
        kind: 'custom',
      })
      .expect(201);
    await http
      .post('/tenant/roster/publish')
      .set(bearer(admin))
      .send({ locationId: siteId, from: started.date, to: started.date })
      .expect(200);

    code = new URLSearchParams(
      (
        await http.get(`/tenant/locations/${siteId}/checkin-code`).set(bearer(admin)).expect(200)
      ).body.path.split('?')[1],
    ).get('c')!;
  });

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('refuses a wrong QR code', async () => {
    const res = await scan(officerToken, { ...SITE, code: 'x'.repeat(64) }).expect(422);
    expect(res.body.code).toBe('invalid_checkin_code');
  });

  it('refuses a position outside the geofence and says how far it is', async () => {
    const res = await scan(officerToken, {
      latitude: -6.2088,
      longitude: 106.8456,
      accuracy: 10,
    }).expect(422);
    expect(res.body.code).toBe('outside_geofence');
    expect(res.body.distanceM).toBeGreaterThan(900_000);
    expect(res.body.radiusM).toBe(150);
  });

  it('checks in on site and records how late the officer is', async () => {
    // About 100 m north of the site point.
    const res = await scan(officerToken, {
      latitude: -8.7448,
      longitude: 115.2149,
      accuracy: 12,
    }).expect(200);
    expect(res.body).toMatchObject({
      kind: 'check_in',
      shift: { locationName: 'Pelabuhan Benoa' },
    });
    expect(res.body.lateMinutes).toBeGreaterThanOrEqual(19);
    expect(res.body.lateMinutes).toBeLessThanOrEqual(21);
    expect(res.body.distanceM).toBeGreaterThan(90);
    expect(res.body.distanceM).toBeLessThan(110);
  });

  it('shows the check-in on the roster and on my shifts', async () => {
    const today = siteClock(0).date;
    const roster = await http
      .get(`/tenant/roster?locationId=${siteId}&from=${today}&to=${today}`)
      .set(bearer(admin))
      .expect(200);
    expect(roster.body[0].attendance).toMatchObject({ checkOutAt: null });
    expect(roster.body[0].attendance.checkInAt).toBeTruthy();

    const mine = await http
      .get(`/me/shifts?from=${today}&to=${today}`)
      .set(bearer(officerToken))
      .expect(200);
    expect(mine.body[0].attendance.lateMinutes).toBeGreaterThanOrEqual(19);
  });

  it('checks out on the next scan, then refuses a third', async () => {
    const out = await scan(officerToken, SITE).expect(200);
    expect(out.body).toMatchObject({ kind: 'check_out', lateMinutes: null });
    const again = await scan(officerToken, SITE).expect(409);
    expect(again.body.code).toBe('already_checked_out');
  });

  it('refuses an officer without a published shift here', async () => {
    const res = await scan(idleToken, SITE).expect(422);
    expect(res.body.code).toBe('no_active_shift');
  });

  it('voids old QR posters when the code is rotated', async () => {
    const rotated = await http
      .post(`/tenant/locations/${siteId}/checkin-code/rotate`)
      .set(bearer(admin))
      .expect(200);
    expect(rotated.body.path).not.toContain(code);
    const res = await scan(idleToken, SITE).expect(422);
    expect(res.body.code).toBe('invalid_checkin_code');
  });

  it('keeps the evidence: position and distance are stored', async () => {
    const rows = await owner.query(
      `select kind, distance_m, accuracy_m from attendance_events where employee_id = $1 order by occurred_at`,
      [officerId],
    );
    expect(rows.rows.map((r) => r.kind)).toEqual(['check_in', 'check_out']);
    expect(rows.rows[0].accuracy_m).toBe(12);
  });
});
