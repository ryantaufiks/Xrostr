import type { INestApplication } from '@nestjs/common';
import type { CreateEmployeeRequest } from '@xrostr/contracts';
import pg from 'pg';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { seedTenant, seedUser, signIn, startApp } from './support/test-app.js';

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const PASSWORD = 'Workforce-Password-2026';
const OFFICER_PASSWORD = 'Officer-Password-2026';

describe('workforce: sites and employees', () => {
  const owner = new pg.Pool({ connectionString: inject('ownerUrl'), max: 1 });
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let tenant: Awaited<ReturnType<typeof seedTenant>>;
  let admin: string;
  let hr: string;
  let supervisor: string;
  let jakartaSite: string;
  let singaporeSite: string;
  let officerId: string;
  let officerInvite: string;

  const officer = (overrides: Partial<CreateEmployeeRequest> = {}): CreateEmployeeRequest => ({
    fullName: 'Slamet Riyadi',
    email: 'slamet@garda.test',
    phone: '+62 812-3456-7890',
    employeeNo: 'SO-001',
    legalEntityId: tenant.idEntityId,
    locationId: jakartaSite,
    jobTitle: 'Security Officer',
    employmentType: 'full_time',
    startDate: '2026-11-01',
    role: 'employee',
    ...overrides,
  });

  beforeAll(async () => {
    tenant = await seedTenant(owner, 'garda');
    await seedUser(owner, tenant, 'tenant_admin', 'admin@garda.test', PASSWORD);
    await seedUser(owner, tenant, 'hr', 'hr@garda.test', PASSWORD);
    await seedUser(owner, tenant, 'supervisor', 'spv@garda.test', PASSWORD);
    ({ app, http } = await startApp());
    admin = await signIn(http, 'garda', 'admin@garda.test', PASSWORD);
    hr = await signIn(http, 'garda', 'hr@garda.test', PASSWORD);
    supervisor = await signIn(http, 'garda', 'spv@garda.test', PASSWORD);
  });

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('lets the company admin, not HR, create sites', async () => {
    await http
      .post('/tenant/locations')
      .set(bearer(hr))
      .send({
        name: 'Nope',
        code: 'NOPE',
        legalEntityId: tenant.idEntityId,
        timezone: 'Asia/Jakarta',
        geofenceRadiusM: 150,
      })
      .expect(403);
  });

  it('creates sites with a time zone of the legal entity’s country', async () => {
    const site = await http
      .post('/tenant/locations')
      .set(bearer(admin))
      .send({
        name: 'Menara Sudirman',
        code: 'jkt-01',
        legalEntityId: tenant.idEntityId,
        timezone: 'Asia/Jakarta',
        latitude: -6.2088,
        longitude: 106.8456,
        geofenceRadiusM: 150,
      })
      .expect(201);
    expect(site.body).toMatchObject({ code: 'JKT-01', legalEntity: { countryCode: 'ID' } });
    jakartaSite = site.body.id;

    singaporeSite = (
      await http
        .post('/tenant/locations')
        .set(bearer(admin))
        .send({
          name: 'Marina Bay Tower',
          code: 'SG-01',
          legalEntityId: tenant.sgEntityId,
          timezone: 'Asia/Singapore',
          geofenceRadiusM: 100,
        })
        .expect(201)
    ).body.id;
  });

  it('rejects a foreign time zone, a duplicate code and half a coordinate', async () => {
    const base = { name: 'Gudang Timur', legalEntityId: tenant.idEntityId, geofenceRadiusM: 150 };
    const tz = await http
      .post('/tenant/locations')
      .set(bearer(admin))
      .send({ ...base, code: 'X-1', timezone: 'Asia/Singapore' })
      .expect(422);
    expect(tz.body.code).toBe('timezone_not_in_country');
    const dup = await http
      .post('/tenant/locations')
      .set(bearer(admin))
      .send({ ...base, code: 'JKT-01', timezone: 'Asia/Jakarta' })
      .expect(409);
    expect(dup.body.code).toBe('location_code_taken');
    await http
      .post('/tenant/locations')
      .set(bearer(admin))
      .send({ ...base, code: 'X-2', timezone: 'Asia/Jakarta', latitude: -6.2 })
      .expect(422);
  });

  it('creates an employee with an account, a role and an invite link', async () => {
    const created = await http
      .post('/tenant/employees')
      .set(bearer(hr))
      .send(officer())
      .expect(201);
    officerId = created.body.employeeId;
    officerInvite = created.body.inviteToken;
    expect(officerInvite).toMatch(new RegExp(`^${tenant.tenantId}\\.`));

    const list = await http.get('/tenant/employees').set(bearer(hr)).expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({
        employeeNo: 'SO-001',
        email: 'slamet@garda.test',
        phone: '+6281234567890',
        accountStatus: 'invited',
        role: 'employee',
        location: { id: jakartaSite, name: 'Menara Sudirman' },
        legalEntity: expect.objectContaining({ countryCode: 'ID' }),
      }),
    ]);
  });

  it('rejects duplicates and a site of another legal entity', async () => {
    const email = await http
      .post('/tenant/employees')
      .set(bearer(hr))
      .send(officer({ employeeNo: 'SO-002' }))
      .expect(409);
    expect(email.body.code).toBe('email_taken');
    const no = await http
      .post('/tenant/employees')
      .set(bearer(hr))
      .send(officer({ email: 'other@garda.test' }))
      .expect(409);
    expect(no.body.code).toBe('employee_no_taken');
    const site = await http
      .post('/tenant/employees')
      .set(bearer(hr))
      .send(officer({ email: 'other@garda.test', employeeNo: 'SO-003', locationId: singaporeSite }))
      .expect(422);
    expect(site.body.code).toBe('location_in_other_entity');
  });

  it('re-issues an invite and retires the old link', async () => {
    const fresh = await http
      .post(`/tenant/employees/${officerId}/invite`)
      .set(bearer(hr))
      .expect(200);
    await http
      .post('/auth/accept-invite')
      .send({ inviteToken: officerInvite, password: OFFICER_PASSWORD })
      .expect(404);
    await http
      .post('/auth/accept-invite')
      .send({ inviteToken: fresh.body.inviteToken, password: OFFICER_PASSWORD })
      .expect(200);
    const again = await http
      .post(`/tenant/employees/${officerId}/invite`)
      .set(bearer(hr))
      .expect(409);
    expect(again.body.code).toBe('user_already_active');
  });

  it('gives officers no access to staff data and supervisors read-only access', async () => {
    const officerToken = await signIn(http, 'garda', 'slamet@garda.test', OFFICER_PASSWORD);
    await http.get('/tenant/employees').set(bearer(officerToken)).expect(403);
    await http.get('/tenant/employees').set(bearer(supervisor)).expect(200);
    await http.get('/tenant/locations').set(bearer(supervisor)).expect(200);
    await http
      .post('/tenant/employees')
      .set(bearer(supervisor))
      .send(officer({ email: 'x@garda.test', employeeNo: 'SO-009' }))
      .expect(403);
  });

  it('blocks sign-in while an employee is inactive and restores it after', async () => {
    const login = () =>
      http
        .post('/auth/login')
        .send({ tenantSlug: 'garda', email: 'slamet@garda.test', password: OFFICER_PASSWORD });
    const session = (await login().expect(200)).body;

    const off = await http
      .patch(`/tenant/employees/${officerId}`)
      .set(bearer(hr))
      .send({ status: 'inactive' })
      .expect(200);
    expect(off.body).toMatchObject({ status: 'inactive', accountStatus: 'disabled' });
    await login().expect(401);
    await http.post('/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);

    const on = await http
      .patch(`/tenant/employees/${officerId}`)
      .set(bearer(hr))
      .send({ status: 'active' })
      .expect(200);
    expect(on.body.accountStatus).toBe('active');
    await login().expect(200);
  });

  it('keeps each company’s staff invisible to the others', async () => {
    const other = await seedTenant(owner, 'rival');
    await seedUser(owner, other, 'hr', 'hr@rival.test', PASSWORD);
    const rivalHr = await signIn(http, 'rival', 'hr@rival.test', PASSWORD);
    const list = await http.get('/tenant/employees').set(bearer(rivalHr)).expect(200);
    expect(list.body).toEqual([]);
    await http
      .patch(`/tenant/employees/${officerId}`)
      .set(bearer(rivalHr))
      .send({ status: 'inactive' })
      .expect(404);
  });
});
