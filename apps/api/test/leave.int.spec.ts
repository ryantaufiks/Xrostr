import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { seedTenant, seedUser, signIn, startApp } from './support/test-app.js';

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const PASSWORD = 'Leave-Password-2026';

describe('leave: balances, requests, approvals and public holidays', () => {
  const owner = new pg.Pool({ connectionString: inject('ownerUrl'), max: 1 });
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let tenant: Awaited<ReturnType<typeof seedTenant>>;
  let admin: string;
  let hr: string;
  let officer: string;
  let officerUserId: string;
  let newcomer: string;
  let supervisor: string;
  let site: string;

  const ask = (token: string, body: Record<string, unknown>) =>
    http.post('/me/leave').set(bearer(token)).send(body);

  beforeAll(async () => {
    tenant = await seedTenant(owner, 'cuti-co');
    await seedUser(owner, tenant, 'tenant_admin', 'admin@cuti.test', PASSWORD);
    await seedUser(owner, tenant, 'hr', 'hr@cuti.test', PASSWORD);
    ({ app, http } = await startApp());
    admin = await signIn(http, 'cuti-co', 'admin@cuti.test', PASSWORD);
    hr = await signIn(http, 'cuti-co', 'hr@cuti.test', PASSWORD);

    site = (
      await http
        .post('/tenant/locations')
        .set(bearer(admin))
        .send({
          name: 'Gudang Cikarang',
          code: 'CKR-01',
          legalEntityId: tenant.idEntityId,
          timezone: 'Asia/Jakarta',
          geofenceRadiusM: 150,
        })
        .expect(201)
    ).body.id;

    const hire = async (no: string, entity: string, startDate: string, role: string) => {
      const email = `${no.toLowerCase()}@cuti.test`;
      const res = await http
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          fullName: `Staf ${no}`,
          email,
          employeeNo: no,
          legalEntityId: entity,
          employmentType: 'full_time',
          startDate,
          role,
        })
        .expect(201);
      await http
        .post('/auth/accept-invite')
        .send({ inviteToken: res.body.inviteToken, password: PASSWORD })
        .expect(200);
      return {
        id: res.body.employeeId as string,
        token: await signIn(http, 'cuti-co', email, PASSWORD),
      };
    };
    const so = await hire('SO-1', tenant.idEntityId, '2024-06-01', 'employee');
    officer = so.token;
    officerUserId = (
      await owner.query<{ id: string }>(`select id from users where email = 'so-1@cuti.test'`)
    ).rows[0]!.id;
    newcomer = (await hire('SG-1', tenant.sgEntityId, '2026-11-01', 'employee')).token;
    supervisor = (await hire('SPV-1', tenant.idEntityId, '2023-01-01', 'supervisor')).token;

    // A published shift on Christmas Eve, inside the leave that will be approved.
    await http
      .post('/tenant/shifts')
      .set(bearer(admin))
      .send({
        locationId: site,
        employeeId: so.id,
        date: '2026-12-24',
        startTime: '07:00',
        durationHours: 8,
        kind: 'day',
      })
      .expect(201);
    await http
      .post('/tenant/roster/publish')
      .set(bearer(admin))
      .send({ locationId: site, from: '2026-12-24', to: '2026-12-24' })
      .expect(200);
  });

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('copies the country holiday calendar on first use and keeps HR edits', async () => {
    const list = () =>
      http.get('/tenant/holidays?countryCode=ID&year=2026').set(bearer(officer)).expect(200);
    const first = (await list()).body as { id: string; date: string; name: string }[];
    expect(first.find((h) => h.date === '2026-12-25')?.name).toBe('Hari Raya Natal');

    const imlek = first.find((h) => h.date === '2026-02-17')!;
    await http.delete(`/tenant/holidays/${imlek.id}`).set(bearer(hr)).expect(204);
    const after = (await list()).body as { date: string }[];
    expect(after.map((h) => h.date)).not.toContain('2026-02-17');
    expect(after).toHaveLength(first.length - 1);

    const dup = await http
      .post('/tenant/holidays')
      .set(bearer(hr))
      .send({ countryCode: 'ID', date: '2026-12-25', name: 'Natal' })
      .expect(409);
    expect(dup.body.code).toBe('holiday_exists');
    await http
      .post('/tenant/holidays')
      .set(bearer(officer))
      .send({ countryCode: 'ID', date: '2026-12-31', name: 'Cuti bersama' })
      .expect(403);
  });

  it('shows the statutory balances of the employee’s country', async () => {
    const mine = await http.get('/me/leave?year=2026').set(bearer(officer)).expect(200);
    expect(mine.body.balances.find((b: { code: string }) => b.code === 'annual')).toMatchObject({
      entitlement: 12,
      used: 0,
      remaining: 12,
      eligible: true,
    });
    const sg = await http.get('/me/leave?year=2026').set(bearer(newcomer)).expect(200);
    expect(sg.body.balances.find((b: { code: string }) => b.code === 'annual')).toMatchObject({
      eligible: false,
    });
  });

  it('refuses requests that break the rules', async () => {
    const codeOf = async (token: string, body: Record<string, unknown>) =>
      (await ask(token, body)).body.code;
    expect(
      await codeOf(newcomer, {
        leaveType: 'annual',
        startDate: '2026-11-20',
        endDate: '2026-11-21',
      }),
    ).toBe('leave_not_eligible');
    expect(
      await codeOf(officer, {
        leaveType: 'childcare',
        startDate: '2026-11-20',
        endDate: '2026-11-20',
      }),
    ).toBe('leave_type_unknown');
    expect(
      await codeOf(officer, {
        leaveType: 'annual',
        startDate: '2026-12-30',
        endDate: '2027-01-02',
      }),
    ).toBe('leave_crosses_year');
    expect(
      await codeOf(officer, {
        leaveType: 'annual',
        startDate: '2026-12-25',
        endDate: '2026-12-25',
      }),
    ).toBe('leave_no_days');
    expect(
      await codeOf(officer, {
        leaveType: 'annual',
        startDate: '2026-11-16',
        endDate: '2026-11-30',
      }),
    ).toBe('leave_insufficient');
    await ask(officer, {
      leaveType: 'annual',
      startDate: '2026-12-02',
      endDate: '2026-12-01',
    }).expect(422);
  });

  it('files a request, skipping holidays, and tells the approvers', async () => {
    const res = await ask(officer, {
      leaveType: 'annual',
      startDate: '2026-12-24',
      endDate: '2026-12-26',
      reason: 'Natal bersama keluarga',
    }).expect(201);
    expect(res.body).toMatchObject({
      status: 'pending',
      days: 2,
      leaveType: { name: { en: 'Annual leave', id: 'Cuti tahunan' } },
    });

    const overlap = await ask(officer, {
      leaveType: 'annual',
      startDate: '2026-12-26',
      endDate: '2026-12-28',
    }).expect(409);
    expect(overlap.body.code).toBe('leave_overlap');

    const mine = await http.get('/me/leave?year=2026').set(bearer(officer)).expect(200);
    expect(mine.body.balances.find((b: { code: string }) => b.code === 'annual')).toMatchObject({
      pending: 2,
      remaining: 10,
    });
    const notes = await owner.query(
      `select u.email from notifications n join users u on u.id = n.user_id where n.kind = 'leave.requested' order by u.email`,
    );
    expect(notes.rows.map((r) => r.email)).toEqual([
      'admin@cuti.test',
      'hr@cuti.test',
      'spv-1@cuti.test',
    ]);
  });

  it('lets approvers see the queue with the shifts it would withdraw; officers cannot', async () => {
    const queue = await http.get('/tenant/leave/requests').set(bearer(supervisor)).expect(200);
    expect(queue.body).toHaveLength(1);
    expect(queue.body[0]).toMatchObject({ employee: { employeeNo: 'SO-1' }, conflictingShifts: 1 });
    await http.get('/tenant/leave/requests').set(bearer(officer)).expect(403);
  });

  it('approves leave, withdraws the shift and tells the officer', async () => {
    const [pending] = (await http.get('/tenant/leave/requests').set(bearer(hr)).expect(200)).body;
    const decided = await http
      .post(`/tenant/leave/requests/${pending.id}/decision`)
      .set(bearer(hr))
      .send({ decision: 'approve', note: 'Selamat Natal' })
      .expect(200);
    expect(decided.body).toMatchObject({ status: 'approved', conflictingShifts: 1 });

    const again = await http
      .post(`/tenant/leave/requests/${pending.id}/decision`)
      .set(bearer(hr))
      .send({ decision: 'reject' })
      .expect(409);
    expect(again.body.code).toBe('leave_not_pending');

    const shift = await owner.query(
      `select status from shifts where starts_at::date = '2026-12-24'`,
    );
    expect(shift.rows[0].status).toBe('cancelled');
    const notes = await owner.query(
      `select kind, body from notifications where user_id = $1 and kind like 'leave.%'`,
      [officerUserId],
    );
    expect(notes.rows).toEqual([
      expect.objectContaining({
        kind: 'leave.approved',
        body: expect.stringContaining('Selamat Natal'),
      }),
    ]);
    const mine = await http.get('/me/leave?year=2026').set(bearer(officer)).expect(200);
    expect(mine.body.balances.find((b: { code: string }) => b.code === 'annual')).toMatchObject({
      used: 2,
      pending: 0,
      remaining: 10,
    });
  });

  it('refuses self-approval and lets an employee cancel only their own pending request', async () => {
    const own = await ask(supervisor, {
      leaveType: 'annual',
      startDate: '2026-11-23',
      endDate: '2026-11-24',
    }).expect(201);
    const self = await http
      .post(`/tenant/leave/requests/${own.body.id}/decision`)
      .set(bearer(supervisor))
      .send({ decision: 'approve' })
      .expect(403);
    expect(self.body.code).toBe('leave_self_approval');

    await http.post(`/me/leave/${own.body.id}/cancel`).set(bearer(officer)).expect(404);
    await http.post(`/me/leave/${own.body.id}/cancel`).set(bearer(supervisor)).expect(204);
    await http.post(`/me/leave/${own.body.id}/cancel`).set(bearer(supervisor)).expect(409);
  });

  it('keeps leave private to its company', async () => {
    const [request] = (
      await http.get('/tenant/leave/requests?status=approved').set(bearer(hr)).expect(200)
    ).body;
    const other = await seedTenant(owner, 'cuti-rival');
    await seedUser(owner, other, 'hr', 'hr@rival.test', PASSWORD);
    const rival = await signIn(http, 'cuti-rival', 'hr@rival.test', PASSWORD);
    expect(
      (await http.get('/tenant/leave/requests?status=approved').set(bearer(rival)).expect(200))
        .body,
    ).toEqual([]);
    await http
      .post(`/tenant/leave/requests/${request.id}/decision`)
      .set(bearer(rival))
      .send({ decision: 'reject' })
      .expect(404);
  });
});
