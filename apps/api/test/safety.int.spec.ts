import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { seedTenant, seedUser, signIn, startApp } from './support/test-app.js';

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const PASSWORD = 'Safety-Password-2026';

describe('safety: SOS, welfare check answers and the alert list', () => {
  const owner = new pg.Pool({ connectionString: inject('ownerUrl'), max: 1 });
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let tenant: Awaited<ReturnType<typeof seedTenant>>;
  let supervisor: string;
  let hr: string;
  let officer: string;
  let officerId: string;
  let officerUserId: string;
  let supervisorUserId: string;
  let site: string;
  let shift: string;
  let sosId: string;

  const notes = (userId: string, kind: string) =>
    owner.query(`select title, body from notifications where user_id = $1 and kind = $2`, [
      userId,
      kind,
    ]);

  beforeAll(async () => {
    tenant = await seedTenant(owner, 'aman-co');
    await seedUser(owner, tenant, 'tenant_admin', 'admin@aman.test', PASSWORD);
    await seedUser(owner, tenant, 'supervisor', 'spv@aman.test', PASSWORD);
    await seedUser(owner, tenant, 'hr', 'hr@aman.test', PASSWORD);
    ({ app, http } = await startApp());
    const admin = await signIn(http, 'aman-co', 'admin@aman.test', PASSWORD);
    supervisor = await signIn(http, 'aman-co', 'spv@aman.test', PASSWORD);
    hr = await signIn(http, 'aman-co', 'hr@aman.test', PASSWORD);

    site = (
      await http
        .post('/tenant/locations')
        .set(bearer(admin))
        .send({
          name: 'Gudang Cikarang',
          code: 'CKR-01',
          legalEntityId: tenant.idEntityId,
          timezone: 'Asia/Jakarta',
          latitude: -6.3,
          longitude: 107.15,
          geofenceRadiusM: 150,
          welfareIntervalMinutes: 60,
        })
        .expect(201)
    ).body.id;
    const located = await http.get('/tenant/locations').set(bearer(admin)).expect(200);
    expect(located.body[0].welfareIntervalMinutes).toBe(60);

    const res = await http
      .post('/tenant/employees')
      .set(bearer(admin))
      .send({
        fullName: 'Pak Joko',
        email: 'joko@aman.test',
        employeeNo: 'SO-7',
        legalEntityId: tenant.idEntityId,
        locationId: site,
        employmentType: 'full_time',
        startDate: '2025-01-01',
        role: 'employee',
      })
      .expect(201);
    officerId = res.body.employeeId;
    await http
      .post('/auth/accept-invite')
      .send({ inviteToken: res.body.inviteToken, password: PASSWORD })
      .expect(200);
    officer = await signIn(http, 'aman-co', 'joko@aman.test', PASSWORD);
    const ids = await owner.query<{ id: string; email: string }>(
      `select id, email from users where email in ('joko@aman.test', 'spv@aman.test')`,
    );
    officerUserId = ids.rows.find((r) => r.email === 'joko@aman.test')!.id;
    supervisorUserId = ids.rows.find((r) => r.email === 'spv@aman.test')!.id;
    shift = (
      await owner.query<{ id: string }>(
        `insert into shifts (id, tenant_id, location_id, employee_id, kind, status, starts_at, ends_at)
         values (gen_random_uuid(), $1, $2, $3, 'custom', 'published', now() - interval '1 hour', now() + interval '7 hours')
         returning id`,
        [tenant.tenantId, site, officerId],
      )
    ).rows[0]!.id;
  });

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('raises an SOS with the position and tells every responder at once', async () => {
    const res = await http
      .post('/me/sos')
      .set(bearer(officer))
      .send({
        latitude: -6.3001,
        longitude: 107.1502,
        accuracy: 12,
        note: 'Ada penyusup di gudang 3',
      })
      .expect(201);
    sosId = res.body.id;
    expect(res.body).toMatchObject({
      kind: 'sos',
      status: 'open',
      employee: { fullName: 'Pak Joko', employeeNo: 'SO-7' },
      location: { name: 'Gudang Cikarang' },
      latitude: -6.3001,
      accuracyM: 12,
      note: 'Ada penyusup di gudang 3',
    });
    const told = await owner.query(
      `select u.email from notifications n join users u on u.id = n.user_id where n.kind = 'alert.sos' order by u.email`,
    );
    // Admin and supervisor respond to alerts; HR does not.
    expect(told.rows.map((r) => r.email)).toEqual(['admin@aman.test', 'spv@aman.test']);
    const [note] = (await notes(supervisorUserId, 'alert.sos')).rows;
    expect(note).toMatchObject({ title: 'SOS: Pak Joko' });
    expect(note.body).toContain('Gudang Cikarang');
  });

  it('shows the officer their SOS until it is resolved', async () => {
    const mine = await http.get('/me/safety').set(bearer(officer)).expect(200);
    expect(mine.body).toMatchObject({ check: null, sos: { id: sosId, status: 'open' } });
  });

  it('lets responders acknowledge, which tells the officer, then resolve', async () => {
    await http.get('/tenant/alerts').set(bearer(officer)).expect(403);
    await http.get('/tenant/alerts').set(bearer(hr)).expect(403);
    const open = await http.get('/tenant/alerts').set(bearer(supervisor)).expect(200);
    expect(open.body.map((a: { id: string }) => a.id)).toEqual([sosId]);

    const ack = await http
      .post(`/tenant/alerts/${sosId}/acknowledge`)
      .set(bearer(supervisor))
      .expect(200);
    expect(ack.body).toMatchObject({ status: 'acknowledged', acknowledgedBy: 'spv@aman.test' });
    expect((await notes(officerUserId, 'alert.sos_acknowledged')).rows).toEqual([
      expect.objectContaining({ title: 'SOS Anda diterima' }),
    ]);

    const done = await http
      .post(`/tenant/alerts/${sosId}/resolve`)
      .set(bearer(supervisor))
      .send({ note: 'Polisi datang, aman' })
      .expect(200);
    expect(done.body).toMatchObject({ status: 'resolved', note: 'Polisi datang, aman' });
    await http.post(`/tenant/alerts/${sosId}/resolve`).set(bearer(supervisor)).send({}).expect(409);
    expect((await http.get('/tenant/alerts').set(bearer(supervisor)).expect(200)).body).toEqual([]);
    const all = await http.get('/tenant/alerts?status=all').set(bearer(supervisor)).expect(200);
    expect(all.body).toHaveLength(1);
    expect((await http.get('/me/safety').set(bearer(officer)).expect(200)).body.sos).toBeNull();
  });

  it('records an answer to a welfare check', async () => {
    const check = (
      await owner.query<{ id: string }>(
        `insert into welfare_checks (id, tenant_id, shift_id, employee_id, location_id, prompted_at, respond_by)
         values (gen_random_uuid(), $1, $2, $3, $4, now(), now() + interval '10 minutes') returning id`,
        [tenant.tenantId, shift, officerId, site],
      )
    ).rows[0]!.id;
    const mine = await http.get('/me/safety').set(bearer(officer)).expect(200);
    expect(mine.body.check).toMatchObject({ id: check, respondedAt: null });

    await http.post(`/me/welfare/${check}/respond`).set(bearer(supervisor)).send({}).expect(404);
    await http
      .post(`/me/welfare/${check}/respond`)
      .set(bearer(officer))
      .send({ latitude: -6.3, longitude: 107.15 })
      .expect(204);
    // Answering twice is harmless.
    await http.post(`/me/welfare/${check}/respond`).set(bearer(officer)).send({}).expect(204);
    expect((await http.get('/me/safety').set(bearer(officer)).expect(200)).body.check).toBeNull();
  });

  it('closes the escalation and reassures supervisors when a late answer comes in', async () => {
    const check = (
      await owner.query<{ id: string }>(
        `insert into welfare_checks (id, tenant_id, shift_id, employee_id, location_id, prompted_at, respond_by, escalated_at)
         values (gen_random_uuid(), $1, $2, $3, $4, now() - interval '20 minutes', now() - interval '10 minutes', now())
         returning id`,
        [tenant.tenantId, shift, officerId, site],
      )
    ).rows[0]!.id;
    await owner.query(
      `insert into alerts (id, tenant_id, kind, employee_id, location_id, shift_id, welfare_check_id, dedupe_key, raised_at)
       values (gen_random_uuid(), $1, 'welfare_missed', $2, $3, $4, $5, $6, now())`,
      [tenant.tenantId, officerId, site, shift, check, `welfare:${check}`],
    );
    expect(
      (await http.get('/tenant/alerts').set(bearer(supervisor)).expect(200)).body[0].kind,
    ).toBe('welfare_missed');
    await http.post(`/me/welfare/${check}/respond`).set(bearer(officer)).send({}).expect(204);
    expect((await http.get('/tenant/alerts').set(bearer(supervisor)).expect(200)).body).toEqual([]);
    expect((await notes(supervisorUserId, 'alert.welfare_answered')).rows).toEqual([
      expect.objectContaining({ title: 'Pak Joko aman' }),
    ]);
  });

  it('keeps alerts private to their company', async () => {
    const other = await seedTenant(owner, 'aman-rival');
    await seedUser(owner, other, 'supervisor', 'spv@rival-aman.test', PASSWORD);
    const rival = await signIn(http, 'aman-rival', 'spv@rival-aman.test', PASSWORD);
    expect(
      (await http.get('/tenant/alerts?status=all').set(bearer(rival)).expect(200)).body,
    ).toEqual([]);
    await http.post(`/tenant/alerts/${sosId}/acknowledge`).set(bearer(rival)).expect(404);
  });
});
