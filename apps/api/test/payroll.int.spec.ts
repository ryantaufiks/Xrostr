import type { INestApplication } from '@nestjs/common';
import type { PayPolicyView, TimesheetView } from '@xrostr/contracts';
import pg from 'pg';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { seedTenant, seedUser, signIn, startApp } from './support/test-app.js';

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const PASSWORD = 'Payroll-Password-2026';
const TZ = 'Asia/Jakarta';
const HOUR = 3_600_000;

describe('payroll set-up and timesheets (Fase 3A)', () => {
  const owner = new pg.Pool({ connectionString: inject('ownerUrl'), max: 1 });
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let tenant: Awaited<ReturnType<typeof seedTenant>>;
  let admin: string;
  let hr: string;
  let supervisor: string;
  let rivalAdmin: string;
  let site: string;
  let officer: { id: string; token: string };

  beforeAll(async () => {
    tenant = await seedTenant(owner, 'payroll-co');
    const rival = await seedTenant(owner, 'payroll-rival');
    await seedUser(owner, tenant, 'tenant_admin', 'admin@payroll.test', PASSWORD);
    await seedUser(owner, tenant, 'hr', 'hr@payroll.test', PASSWORD);
    await seedUser(owner, tenant, 'supervisor', 'spv@payroll.test', PASSWORD);
    await seedUser(owner, rival, 'tenant_admin', 'admin@payroll-rival.test', PASSWORD);
    ({ app, http } = await startApp());
    admin = await signIn(http, 'payroll-co', 'admin@payroll.test', PASSWORD);
    hr = await signIn(http, 'payroll-co', 'hr@payroll.test', PASSWORD);
    supervisor = await signIn(http, 'payroll-co', 'spv@payroll.test', PASSWORD);
    rivalAdmin = await signIn(http, 'payroll-rival', 'admin@payroll-rival.test', PASSWORD);

    site = (
      await http
        .post('/tenant/locations')
        .set(bearer(admin))
        .send({
          name: 'Menara Sudirman',
          code: 'PY-01',
          legalEntityId: tenant.idEntityId,
          timezone: TZ,
          latitude: -6.2,
          longitude: 106.8,
          geofenceRadiusM: 150,
        })
        .expect(201)
    ).body.id;
    const hired = await http
      .post('/tenant/employees')
      .set(bearer(admin))
      .send({
        fullName: 'Pak Slamet',
        email: 'slamet@payroll.test',
        employeeNo: 'SO-001',
        legalEntityId: tenant.idEntityId,
        locationId: site,
        employmentType: 'full_time',
        startDate: '2024-01-01',
        role: 'employee',
      })
      .expect(201);
    await http
      .post('/auth/accept-invite')
      .send({ inviteToken: hired.body.inviteToken, password: PASSWORD })
      .expect(200);
    officer = {
      id: hired.body.employeeId,
      token: await signIn(http, 'payroll-co', 'slamet@payroll.test', PASSWORD),
    };
  });

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  describe('pay policy', () => {
    it('starts from the Country Pack defaults and saves per legal entity', async () => {
      const list = (await http.get('/tenant/pay-policies').set(bearer(hr)).expect(200))
        .body as PayPolicyView[];
      const byCountry = Object.fromEntries(list.map((p) => [p.legalEntity.countryCode, p]));
      expect(byCountry.ID).toMatchObject({
        saved: false,
        bankFormat: 'mandiri',
        currency: 'IDR',
        currencyMinorUnits: 0,
        overtimeEnabled: true,
        taxMethod: 'gross',
      });
      expect(byCountry.SG).toMatchObject({ bankFormat: 'dbs', currencyMinorUnits: 2 });

      const saved = await http
        .put(`/tenant/legal-entities/${tenant.idEntityId}/pay-policy`)
        .set(bearer(hr))
        .send({
          ...byCountry.ID,
          overtimeEnabled: false,
          bankFormat: null,
          taxMethod: 'gross_up',
          lateGraceMinutes: 10,
          calloutAmount: 150_000,
        })
        .expect(200);
      expect(saved.body).toMatchObject({
        saved: true,
        overtimeEnabled: false,
        bankFormat: null,
        taxMethod: 'gross_up',
        calloutAmount: 150_000,
      });
    });

    it('is closed to supervisors and other companies', async () => {
      await http.get('/tenant/pay-policies').set(bearer(supervisor)).expect(403);
      await http
        .put(`/tenant/legal-entities/${tenant.idEntityId}/pay-policy`)
        .set(bearer(rivalAdmin))
        .send({
          overtimeEnabled: true,
          roundingMinutes: 15,
          lateGraceMinutes: 0,
          lateDeduction: 'none',
          standbyRate: 0,
          standbyUnit: 'shift',
          calloutAmount: 0,
          nightAllowance: 0,
          taxMethod: 'gross',
          bankFormat: null,
          payDay: 1,
        })
        .expect(404);
    });
  });

  describe('pay profile and bank account', () => {
    const profile = {
      effectiveFrom: '2026-01-01',
      payCycle: 'monthly',
      payBasis: 'monthly',
      baseAmount: 5_400_000,
      workDaysPerWeek: 6,
      overtimeEligible: true,
      taxMethod: null,
      allowances: [
        { label: 'Tunjangan jabatan', kind: 'fixed', amount: 300_000 },
        { label: 'Uang makan', kind: 'per_attendance', amount: 25_000 },
      ],
      ptkpStatus: 'K/1',
      taxId: '3171012345678901',
      bpjsTkNo: '12345678901',
    };

    it('stores identifiers encrypted and shows them masked', async () => {
      const res = await http
        .put(`/tenant/employees/${officer.id}/pay-profile`)
        .set(bearer(hr))
        .send(profile)
        .expect(200);
      expect(res.body.current).toMatchObject({
        baseAmount: 5_400_000,
        workDaysPerWeek: 6,
        ptkpStatus: 'K/1',
        taxId: '•••• 8901',
        bpjsTkNo: '•••• 8901',
        bpjsKesNo: null,
      });
      expect(res.body.current.allowances).toHaveLength(2);
      const raw = await owner.query(`select tax_id_enc from pay_profiles where employee_id = $1`, [
        officer.id,
      ]);
      expect(raw.rows[0].tax_id_enc).not.toContain('3171012345678901');
    });

    it('reveals in full only to payroll managers, and audits it', async () => {
      await http
        .get(`/tenant/employees/${officer.id}/pay-profile?reveal=true`)
        .set(bearer(supervisor))
        .expect(403);
      const full = await http
        .get(`/tenant/employees/${officer.id}/pay-profile?reveal=true`)
        .set(bearer(hr))
        .expect(200);
      expect(full.body).toMatchObject({ revealed: true, current: { taxId: '3171012345678901' } });
      const audited = await owner.query(
        `select count(*)::int as n from audit_log where action = 'pay_profile.revealed' and target_id = $1`,
        [officer.id],
      );
      expect(audited.rows[0].n).toBe(1);
    });

    it('keeps history, and keeps identifiers a new version leaves out', async () => {
      const rest: Partial<typeof profile> = { ...profile };
      delete rest.taxId;
      delete rest.bpjsTkNo;
      const res = await http
        .put(`/tenant/employees/${officer.id}/pay-profile`)
        .set(bearer(hr))
        .send({ ...rest, effectiveFrom: '2026-02-01', baseAmount: 5_600_000 })
        .expect(200);
      expect(res.body.history.map((v: { effectiveFrom: string }) => v.effectiveFrom)).toEqual([
        '2026-02-01',
        '2026-01-01',
      ]);
      expect(res.body.history[0]).toMatchObject({ baseAmount: 5_600_000, taxId: '•••• 8901' });
    });

    it('saves the bank account encrypted, masked in views', async () => {
      const res = await http
        .put(`/tenant/employees/${officer.id}/bank-account`)
        .set(bearer(hr))
        .send({ bankName: 'Mandiri', accountNo: '123-000-4567890', accountName: 'Slamet' })
        .expect(200);
      expect(res.body).toMatchObject({ bankName: 'Mandiri', accountNo: '•••• 7890' });
      const raw = await owner.query(
        `select account_no_enc from employee_bank_accounts where employee_id = $1`,
        [officer.id],
      );
      expect(raw.rows[0].account_no_enc).not.toContain('4567890');
      await http
        .get(`/tenant/employees/${officer.id}/pay-profile`)
        .set(bearer(officer.token))
        .expect(403);
    });
  });

  describe('timesheet', () => {
    let shiftId: string;
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(
      new Date(Date.now() - 30 * HOUR),
    );

    beforeAll(async () => {
      // A published 12-hour shift that ended yesterday: checked in late, never checked out.
      const startsAt = new Date(Date.now() - 30 * HOUR);
      shiftId = (
        await owner.query<{ id: string }>(
          `insert into shifts (id, tenant_id, location_id, employee_id, kind, status, starts_at, ends_at, timezone)
           values (gen_random_uuid(), $1, $2, $3, 'day', 'published', $4, $5, $6) returning id`,
          [
            tenant.tenantId,
            site,
            officer.id,
            startsAt,
            new Date(startsAt.getTime() + 12 * HOUR),
            TZ,
          ],
        )
      ).rows[0]!.id;
      await owner.query(
        `insert into attendance_events (id, tenant_id, employee_id, shift_id, location_id, kind, occurred_at, latitude, longitude, distance_m, late_minutes)
         values (gen_random_uuid(), $1, $2, $3, $4, 'check_in', $5, -6.2, 106.8, 10, 25)`,
        [tenant.tenantId, officer.id, shiftId, site, new Date(startsAt.getTime() + 25 * 60_000)],
      );
    });

    const sheet = async (token = supervisor) =>
      (
        await http
          .get(`/tenant/timesheets?legalEntityId=${tenant.idEntityId}&from=${day}&to=${day}`)
          .set(bearer(token))
          .expect(200)
      ).body as TimesheetView;

    it('flags a missing check-out for correction', async () => {
      const view = await sheet();
      const [row] = view.employees;
      expect(row!.employee.fullName).toBe('Pak Slamet');
      expect(row!.workDaysPerWeek).toBe(6);
      expect(row!.entries[0]).toMatchObject({ status: 'incomplete', workedMinutes: 0 });
      expect(row!.totals.incomplete).toBe(1);
      expect(view.workingTime.weeklyMinutes).toBe(2400);
    });

    it('lets a planner correct it, keeping the original and the reason', async () => {
      const ends = new Date(Date.now() - 18 * HOUR);
      const correct = (token: string, body: Record<string, unknown>) =>
        http.post(`/tenant/timesheets/${shiftId}/corrections`).set(bearer(token)).send(body);

      await correct(officer.token, { checkOutAt: ends.toISOString(), reason: 'Lupa scan' }).expect(
        403,
      );
      expect(
        (
          await correct(supervisor, {
            checkOutAt: new Date(ends.getTime() + 6 * HOUR).toISOString(),
            reason: 'Lupa scan',
          }).expect(422)
        ).body.code,
      ).toBe('correction_out_of_range');
      expect(
        (
          await correct(supervisor, {
            checkOutAt: new Date(ends.getTime() - 12 * HOUR).toISOString(),
            reason: 'Lupa scan',
          }).expect(422)
        ).body.code,
      ).toBe('correction_order');
      await correct(supervisor, { checkOutAt: ends.toISOString(), reason: 'Lupa scan' }).expect(
        204,
      );

      const [row] = (await sheet(hr)).employees;
      // 12 h − 25 min late (past the 10-minute grace) = 11 h 35 → 11 h 30 rounded down.
      expect(row!.entries[0]).toMatchObject({
        status: 'worked',
        lateMinutes: 25,
        workedMinutes: 690,
        corrected: true,
        correction: { reason: 'Lupa scan', by: 'spv@payroll.test' },
      });
      const original = await owner.query(
        `select count(*)::int as n from attendance_events where shift_id = $1`,
        [shiftId],
      );
      expect(original.rows[0].n).toBe(1);
    });

    it('keeps timesheets private to the company', async () => {
      await http
        .get(`/tenant/timesheets?legalEntityId=${tenant.idEntityId}&from=${day}&to=${day}`)
        .set(bearer(rivalAdmin))
        .expect(404);
      await http
        .post(`/tenant/timesheets/${shiftId}/corrections`)
        .set(bearer(rivalAdmin))
        .send({ checkInAt: null, reason: 'Coba-coba' })
        .expect(404);
    });
  });
});
