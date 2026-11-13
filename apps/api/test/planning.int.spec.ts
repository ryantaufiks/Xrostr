import type { INestApplication } from '@nestjs/common';
import type { RosterSuggestion } from '@xrostr/contracts';
import pg from 'pg';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { seedTenant, seedUser, signIn, startApp } from './support/test-app.js';

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const PASSWORD = 'Planning-Password-2026';
const TZ = 'Asia/Jakarta';

const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

describe('roster planning aids: rotation patterns and auto-fill', () => {
  const owner = new pg.Pool({ connectionString: inject('ownerUrl'), max: 1 });
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let tenant: Awaited<ReturnType<typeof seedTenant>>;
  let admin: string;
  let rivalAdmin: string;
  let site: string;
  let otherSite: string;
  const people: Record<string, string> = {};
  // A Monday three weeks out, so nothing else in the suite is near it.
  let monday: string;
  const day = (i: number) => addDays(monday, i);

  const draftsAt = async (employeeId: string, locationId: string) =>
    (
      await owner.query<{ kind: string; date: string }>(
        `select kind, to_char(starts_at at time zone $3, 'YYYY-MM-DD') as date from shifts
         where employee_id = $1 and location_id = $2 and status = 'draft' order by starts_at`,
        [employeeId, locationId, TZ],
      )
    ).rows;

  beforeAll(async () => {
    tenant = await seedTenant(owner, 'planning-co');
    const rival = await seedTenant(owner, 'planning-rival');
    await seedUser(owner, tenant, 'tenant_admin', 'admin@planning.test', PASSWORD);
    await seedUser(owner, rival, 'tenant_admin', 'admin@planning-rival.test', PASSWORD);
    ({ app, http } = await startApp());
    admin = await signIn(http, 'planning-co', 'admin@planning.test', PASSWORD);
    rivalAdmin = await signIn(http, 'planning-rival', 'admin@planning-rival.test', PASSWORD);

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
    monday = addDays(today, 22 - weekday);

    const newSite = async (code: string) =>
      (
        await http
          .post('/tenant/locations')
          .set(bearer(admin))
          .send({
            name: `Site ${code}`,
            code,
            legalEntityId: tenant.idEntityId,
            timezone: TZ,
            latitude: -6.2,
            longitude: 106.8,
            geofenceRadiusM: 150,
          })
          .expect(201)
      ).body.id as string;
    site = await newSite('PL-01');
    otherSite = await newSite('PL-02');

    const hire = async (key: string, extra: Record<string, unknown>) => {
      const res = await http
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          fullName: key,
          email: `${key.toLowerCase()}@planning.test`,
          employeeNo: key.toUpperCase(),
          legalEntityId: tenant.idEntityId,
          employmentType: 'full_time',
          startDate: '2024-01-01',
          role: 'employee',
          ...extra,
        })
        .expect(201);
      people[key] = res.body.employeeId;
    };
    await hire('Ana', { locationId: site });
    await hire('Budi', { locationId: site });
    await hire('Cici', { locationId: otherSite });
    await hire('Rover', { assignmentType: 'roving' });

    await http
      .put(`/tenant/locations/${site}/staffing`)
      .set(bearer(admin))
      .send({
        requirements: Array.from({ length: 7 }, (_, i) => ({
          weekday: i + 1,
          dayCount: 1,
          nightCount: 1,
        })),
      })
      .expect(200);

    // Ana: approved leave on Tuesday, and a published night shift here on Wednesday.
    await owner.query(
      `insert into leave_requests (id, tenant_id, employee_id, leave_type, start_date, end_date, days, status)
       values (gen_random_uuid(), $1, $2, 'annual', $3, $3, 1, 'approved')`,
      [tenant.tenantId, people.Ana, day(1)],
    );
    await owner.query(
      `insert into shifts (id, tenant_id, location_id, employee_id, kind, status, starts_at, ends_at, timezone)
       values (gen_random_uuid(), $1, $2, $3, 'night', 'published',
               ($4 || ' 20:00')::timestamp at time zone $5, ($4 || ' 20:00')::timestamp at time zone $5 + interval '12 hours', $5)`,
      [tenant.tenantId, site, people.Ana, day(2), TZ],
    );
    // Budi works at the other site on Monday morning.
    await owner.query(
      `insert into shifts (id, tenant_id, location_id, employee_id, kind, status, starts_at, ends_at, timezone)
       values (gen_random_uuid(), $1, $2, $3, 'day', 'published',
               ($4 || ' 08:00')::timestamp at time zone $5, ($4 || ' 08:00')::timestamp at time zone $5 + interval '12 hours', $5)`,
      [tenant.tenantId, otherSite, people.Budi, day(0), TZ],
    );
  });

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  const rotate = (token: string, body: Record<string, unknown>) =>
    http.post('/tenant/roster/rotation').set(bearer(token)).send(body);

  describe('rotation', () => {
    it('applies a pattern as drafts, skipping leave and published days', async () => {
      const body = {
        locationId: site,
        employeeId: people.Ana,
        from: day(0),
        to: day(6),
        pattern: ['day', 'day', 'night', 'night', 'off', 'off'],
      };
      const res = await rotate(admin, body).expect(200);
      expect(res.body).toEqual({
        created: 3,
        removed: 0,
        skipped: [
          { date: day(1), reason: 'leave' },
          { date: day(2), reason: 'published' },
        ],
      });
      expect(await draftsAt(people.Ana!, site)).toEqual([
        { kind: 'day', date: day(0) },
        { kind: 'night', date: day(3) },
        { kind: 'day', date: day(6) },
      ]);

      // Applied again from step 3 (night, night, off, off, day, day, night): the range now
      // follows the new pattern, and Thursday's night draft goes with its day off.
      const again = await rotate(admin, { ...body, startAt: 2 }).expect(200);
      expect(again.body).toMatchObject({ created: 4, removed: 1 });
      expect(await draftsAt(people.Ana!, site)).toEqual([
        { kind: 'night', date: day(0) },
        { kind: 'day', date: day(4) },
        { kind: 'day', date: day(5) },
        { kind: 'night', date: day(6) },
      ]);
      // Back to the first version for the auto-fill tests below.
      expect((await rotate(admin, body).expect(200)).body).toMatchObject({
        created: 3,
        removed: 2,
      });
      expect((await draftsAt(people.Ana!, site)).map((d) => d.date)).toEqual([
        day(0),
        day(3),
        day(6),
      ]);
    });

    it('creates nothing when one day clashes, and names that day', async () => {
      const res = await rotate(admin, {
        locationId: site,
        employeeId: people.Budi,
        from: day(0),
        to: day(2),
        pattern: ['day'],
      }).expect(409);
      expect(res.body).toMatchObject({ code: 'shift_overlap', date: day(0) });
      expect(await draftsAt(people.Budi!, site)).toEqual([]);
    });

    it('refuses a pattern without work and another tenant’s site', async () => {
      await rotate(admin, {
        locationId: site,
        employeeId: people.Ana,
        from: day(0),
        to: day(1),
        pattern: ['off', 'off'],
      }).expect(422);
      await rotate(rivalAdmin, {
        locationId: site,
        employeeId: people.Ana,
        from: day(0),
        to: day(1),
        pattern: ['day'],
      }).expect(404);
    });
  });

  describe('auto-fill', () => {
    const suggest = (token: string) =>
      http
        .get(`/tenant/roster/suggestions?locationId=${site}&from=${day(0)}&to=${day(6)}`)
        .set(bearer(token));

    it('suggests officers for the gaps only, without breaking a rule', async () => {
      const { suggestions, unfilled } = (await suggest(admin).expect(200)).body as {
        suggestions: RosterSuggestion[];
        unfilled: unknown[];
      };
      const slots = suggestions.map((s) => `${s.date}:${s.kind}`);
      // Already covered: Monday and Sunday days, Wednesday and Thursday nights.
      for (const taken of [`${day(0)}:day`, `${day(6)}:day`, `${day(2)}:night`, `${day(3)}:night`])
        expect(slots).not.toContain(taken);
      expect(new Set(slots).size).toBe(slots.length);
      // Nobody twice on one date, nobody on leave, and the roving officer stays in the zone.
      const perDate = suggestions.map((s) => `${s.date}:${s.employee.id}`);
      expect(new Set(perDate).size).toBe(perDate.length);
      expect(perDate).not.toContain(`${day(1)}:${people.Ana}`);
      expect(suggestions.some((s) => s.employee.id === people.Rover)).toBe(false);
      // Budi is busy elsewhere on Monday morning, so Monday night cannot be his (no rest).
      expect(perDate).not.toContain(`${day(0)}:${people.Budi}`);
      expect(suggestions.length + unfilled.length).toBeGreaterThan(0);

      // The suggestions fit together: applied as one batch, nothing clashes.
      await http
        .post('/tenant/shifts/batch')
        .set(bearer(admin))
        .send({
          items: suggestions.map((s) => ({
            locationId: site,
            employeeId: s.employee.id,
            date: s.date,
            startTime: s.kind === 'day' ? '08:00' : '20:00',
            durationHours: 12,
            kind: s.kind,
          })),
        })
        .expect(201);
      expect((await suggest(admin).expect(200)).body.suggestions).toEqual([]);
    });

    it('keeps suggestions private to the company', async () => {
      await suggest(rivalAdmin).expect(404);
    });
  });
});
