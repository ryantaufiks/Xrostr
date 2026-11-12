import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { seedTenant, seedUser, signIn, startApp } from './support/test-app.js';

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const PASSWORD = 'Roster-Password-2026';
const TZ = 'Asia/Jakarta';
const POINT = { latitude: -6.2, longitude: 106.8 };

/** Local date and HH:MM at the sites, `offsetMinutes` from now. */
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

describe('roster planning: zones, roving, standby, staffing, copy and conflicts', () => {
  const owner = new pg.Pool({ connectionString: inject('ownerUrl'), max: 1 });
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let tenant: Awaited<ReturnType<typeof seedTenant>>;
  let admin: string;
  let rivalAdmin: string;
  let siteA: string;
  let siteB: string;
  let siteC: string;
  let sgSite: string;
  let rivalSite: string;
  let zone: string;
  let rover: { id: string; token: string };
  let homeOfficer: { id: string; token: string };
  let sgOfficer: string;

  const site = async (token: string, entity: string, code: string, timezone = TZ) =>
    (
      await http
        .post('/tenant/locations')
        .set(bearer(token))
        .send({
          name: `Site ${code}`,
          code,
          legalEntityId: entity,
          timezone,
          ...POINT,
          geofenceRadiusM: 150,
        })
        .expect(201)
    ).body.id as string;

  const hire = async (no: string, entity: string, extra: Record<string, unknown> = {}) => {
    const email = `${no.toLowerCase()}@roster-plan.test`;
    const res = await http
      .post('/tenant/employees')
      .set(bearer(admin))
      .send({
        fullName: `Officer ${no}`,
        email,
        employeeNo: no,
        legalEntityId: entity,
        employmentType: 'full_time',
        startDate: '2025-01-01',
        role: 'employee',
        ...extra,
      })
      .expect(201);
    await http
      .post('/auth/accept-invite')
      .send({ inviteToken: res.body.inviteToken, password: PASSWORD })
      .expect(200);
    return {
      id: res.body.employeeId as string,
      token: await signIn(http, 'roster-plan', email, PASSWORD),
    };
  };

  const shift = (body: Record<string, unknown>) =>
    http.post('/tenant/shifts').set(bearer(admin)).send(body);

  const checkinCode = async (locationId: string) =>
    new URLSearchParams(
      (
        await http
          .get(`/tenant/locations/${locationId}/checkin-code`)
          .set(bearer(admin))
          .expect(200)
      ).body.path.split('?')[1],
    ).get('c')!;

  beforeAll(async () => {
    tenant = await seedTenant(owner, 'roster-plan');
    const rival = await seedTenant(owner, 'roster-plan-rival');
    await seedUser(owner, tenant, 'tenant_admin', 'admin@roster-plan.test', PASSWORD);
    await seedUser(owner, rival, 'tenant_admin', 'admin@roster-plan-rival.test', PASSWORD);
    ({ app, http } = await startApp());
    admin = await signIn(http, 'roster-plan', 'admin@roster-plan.test', PASSWORD);
    rivalAdmin = await signIn(http, 'roster-plan-rival', 'admin@roster-plan-rival.test', PASSWORD);

    siteA = await site(admin, tenant.idEntityId, 'A-01');
    siteB = await site(admin, tenant.idEntityId, 'B-01');
    siteC = await site(admin, tenant.idEntityId, 'C-01');
    sgSite = await site(admin, tenant.sgEntityId, 'SG-01', 'Asia/Singapore');
    rivalSite = await site(rivalAdmin, rival.idEntityId, 'R-01');

    rover = await hire('RV-1', tenant.idEntityId, { assignmentType: 'roving' });
    homeOfficer = await hire('HM-1', tenant.idEntityId, { locationId: siteA });
    sgOfficer = (await hire('SG-1', tenant.sgEntityId)).id;
  });

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  describe('zones', () => {
    it('refuses another tenant’s site and unknown sites without linking anything', async () => {
      const foreign = await http
        .post('/tenant/zones')
        .set(bearer(admin))
        .send({ name: 'Mixed tenants', locationIds: [siteA, rivalSite] })
        .expect(404);
      expect(foreign.body.code).toBe('location_not_found');
      await http
        .post('/tenant/zones')
        .set(bearer(admin))
        .send({ name: 'Ghost', locationIds: ['00000000-0000-4000-8000-000000000000'] })
        .expect(404);
      const linked = await owner.query(`select count(*)::int as n from zone_locations`);
      expect(linked.rows[0].n).toBe(0);
    });

    it('keeps a zone within one legal entity and one time zone', async () => {
      const mixed = await http
        .post('/tenant/zones')
        .set(bearer(admin))
        .send({ name: 'Across borders', locationIds: [siteA, sgSite] })
        .expect(422);
      expect(mixed.body.code).toBe('zone_mixed_sites');
    });

    it('creates a zone once per name and keeps it private', async () => {
      zone = (
        await http
          .post('/tenant/zones')
          .set(bearer(admin))
          .send({ name: 'Cluster Sudirman', locationIds: [siteA, siteB] })
          .expect(201)
      ).body.id;
      const again = await http
        .post('/tenant/zones')
        .set(bearer(admin))
        .send({ name: 'Cluster Sudirman', locationIds: [siteA] })
        .expect(409);
      expect(again.body.code).toBe('zone_name_taken');
      expect((await http.get('/tenant/zones').set(bearer(rivalAdmin)).expect(200)).body).toEqual(
        [],
      );
    });
  });

  describe('roving', () => {
    it('refuses a zone shift for an officer of another legal entity', async () => {
      const res = await shift({
        zoneId: zone,
        employeeId: sgOfficer,
        date: siteClock(0).date,
        startTime: '08:00',
        durationHours: 8,
        kind: 'custom',
      }).expect(422);
      expect(res.body.code).toBe('zone_other_entity');
    });

    it('lets the roving officer check in at any site of the zone, and only there', async () => {
      const started = siteClock(-20);
      await shift({
        zoneId: zone,
        employeeId: rover.id,
        date: started.date,
        startTime: started.time,
        durationHours: 8,
        kind: 'custom',
      }).expect(201);
      await http
        .post('/tenant/roster/publish')
        .set(bearer(admin))
        .send({ locationId: siteA, from: started.date, to: started.date })
        .expect(200);

      const outside = await http
        .post('/me/attendance')
        .set(bearer(rover.token))
        .send({ locationId: siteC, code: await checkinCode(siteC), ...POINT, accuracy: 10 })
        .expect(422);
      expect(outside.body.code).toBe('no_active_shift');

      const inside = await http
        .post('/me/attendance')
        .set(bearer(rover.token))
        .send({ locationId: siteB, code: await checkinCode(siteB), ...POINT, accuracy: 10 })
        .expect(200);
      expect(inside.body.kind).toBe('check_in');
    });

    it('lets the roving officer patrol every site of the zone', async () => {
      const route = (
        await http
          .post('/tenant/patrol/routes')
          .set(bearer(admin))
          .send({ locationId: siteB, name: 'Lobby loop' })
          .expect(201)
      ).body;
      await http
        .post(`/tenant/patrol/routes/${route.id}/checkpoints`)
        .set(bearer(admin))
        .send({ name: 'Lobby' })
        .expect(201);
      const [tag] = (
        await http.get(`/tenant/patrol/routes/${route.id}/tags`).set(bearer(admin)).expect(200)
      ).body;

      const mine = await http.get('/me/patrol').set(bearer(rover.token)).expect(200);
      expect(mine.body.shift).toMatchObject({ locationName: 'Cluster Sudirman', timezone: TZ });
      expect(mine.body.routes.map((r: { route: { name: string } }) => r.route.name)).toEqual([
        'Site B-01 · Lobby loop',
      ]);

      const scan = await http
        .post('/me/patrol/scans')
        .set(bearer(rover.token))
        .send({ tag: new URLSearchParams(tag.path.split('?')[1]).get('k') })
        .expect(200);
      expect(scan.body.round).toMatchObject({ status: 'completed', scanned: 1 });
    });

    it('sets visit targets only for the zone’s own sites, privately', async () => {
      const outsider = await http
        .put(`/tenant/zones/${zone}/targets`)
        .set(bearer(admin))
        .send({ visitGapMinutes: 60, targets: [{ locationId: siteC, minVisits: 1 }] })
        .expect(404);
      expect(outsider.body.code).toBe('location_not_found');
      await http
        .put(`/tenant/zones/${zone}/targets`)
        .set(bearer(rivalAdmin))
        .send({ visitGapMinutes: 60, targets: [{ locationId: siteA, minVisits: 1 }] })
        .expect(404);

      const saved = await http
        .put(`/tenant/zones/${zone}/targets`)
        .set(bearer(admin))
        .send({
          visitGapMinutes: 60,
          targets: [
            { locationId: siteA, minVisits: 2 },
            { locationId: siteB, minVisits: 1 },
          ],
        })
        .expect(200);
      expect(saved.body.visitGapMinutes).toBe(60);
      expect(saved.body.locations).toEqual([
        { id: siteA, name: 'Site A-01', minVisits: 2 },
        { id: siteB, name: 'Site B-01', minVisits: 1 },
      ]);
    });

    it('records a visit, not a check-out, when the roving officer scans during the shift', async () => {
      const visit = await http
        .post('/me/attendance')
        .set(bearer(rover.token))
        .send({ locationId: siteA, code: await checkinCode(siteA), ...POINT, accuracy: 10 })
        .expect(200);
      expect(visit.body).toMatchObject({ kind: 'visit', roving: true });
      // A second scan straight away is recorded, but counts as the same visit.
      await http
        .post('/me/attendance')
        .set(bearer(rover.token))
        .send({ locationId: siteA, code: await checkinCode(siteA), ...POINT, accuracy: 10 })
        .expect(200);

      const day = siteClock(-20).date;
      const [view] = (
        await http.get(`/tenant/roving/visits?date=${day}`).set(bearer(admin)).expect(200)
      ).body;
      expect(view).toMatchObject({
        zone: { id: zone, name: 'Cluster Sudirman' },
        phase: 'running',
        unservedSince: null,
        visitGapMinutes: 60,
      });
      expect(view.checkedInAt).not.toBeNull();
      const bySite = Object.fromEntries(
        view.sites.map((s: { location: { id: string } }) => [s.location.id, s]),
      );
      // Site B: the check-in and the patrol scan minutes apart make one visit.
      expect(bySite[siteB]).toMatchObject({ visits: 1, minVisits: 1, state: 'met' });
      expect(bySite[siteA]).toMatchObject({ visits: 1, minVisits: 2, state: 'pending' });
      expect(
        (await http.get(`/tenant/roving/visits?date=${day}`).set(bearer(rivalAdmin)).expect(200))
          .body,
      ).toEqual([]);
    });

    it('ends the roving shift when the officer asks to check out', async () => {
      const out = await http
        .post('/me/attendance')
        .set(bearer(rover.token))
        .send({
          locationId: siteA,
          code: await checkinCode(siteA),
          ...POINT,
          accuracy: 10,
          action: 'check_out',
        })
        .expect(200);
      expect(out.body.kind).toBe('check_out');
    });
  });

  describe('standby', () => {
    const tomorrow = siteClock(24 * 60).date;

    it('lets an officer on standby be called in to work, but not double-booked on standby', async () => {
      await shift({
        employeeId: homeOfficer.id,
        date: tomorrow,
        startTime: '20:00',
        durationHours: 12,
        kind: 'standby',
      }).expect(201);
      await shift({
        locationId: siteA,
        employeeId: homeOfficer.id,
        date: tomorrow,
        startTime: '22:00',
        durationHours: 4,
        kind: 'custom',
      }).expect(201);
      const twice = await shift({
        employeeId: homeOfficer.id,
        date: tomorrow,
        startTime: '21:00',
        durationHours: 4,
        kind: 'standby',
      }).expect(409);
      expect(twice.body.code).toBe('shift_overlap');
    });

    it('is published with the officer’s own site, not with another site', async () => {
      const status = async () =>
        (
          await owner.query<{ status: string }>(
            `select status from shifts where employee_id = $1 and kind = 'standby'`,
            [homeOfficer.id],
          )
        ).rows[0]!.status;
      await http
        .post('/tenant/roster/publish')
        .set(bearer(admin))
        .send({ locationId: siteC, from: tomorrow, to: tomorrow })
        .expect(200);
      expect(await status()).toBe('draft');
      await http
        .post('/tenant/roster/publish')
        .set(bearer(admin))
        .send({ locationId: siteA, from: tomorrow, to: tomorrow })
        .expect(200);
      expect(await status()).toBe('published');
    });

    it('is never a check-in shift', async () => {
      const officer = await hire('SB-1', tenant.idEntityId, { locationId: siteC });
      const started = siteClock(-10);
      await shift({
        employeeId: officer.id,
        date: started.date,
        startTime: started.time,
        durationHours: 8,
        kind: 'standby',
      }).expect(201);
      await owner.query(`update shifts set status = 'published' where employee_id = $1`, [
        officer.id,
      ]);
      const res = await http
        .post('/me/attendance')
        .set(bearer(officer.token))
        .send({ locationId: siteC, code: await checkinCode(siteC), ...POINT, accuracy: 10 })
        .expect(422);
      expect(res.body.code).toBe('no_active_shift');
    });

    it('has the database enforce one place per working shift', async () => {
      await expect(
        owner.query(
          `insert into shifts (id, tenant_id, employee_id, kind, status, starts_at, ends_at)
           values (gen_random_uuid(), $1, $2, 'day', 'draft', now() + interval '10 days', now() + interval '10 days 8 hours')`,
          [tenant.tenantId, homeOfficer.id],
        ),
      ).rejects.toThrow(/shifts_place_ck/);
    });
  });

  describe('staffing, copy and conflicts', () => {
    it('stores a week of staffing targets per site, privately', async () => {
      const requirements = Array.from({ length: 7 }, (_, i) => ({
        weekday: i + 1,
        dayCount: i < 5 ? 2 : 1,
        nightCount: 1,
      }));
      await http
        .put(`/tenant/locations/${siteA}/staffing`)
        .set(bearer(admin))
        .send({ requirements })
        .expect(200);
      const read = await http
        .get(`/tenant/locations/${siteA}/staffing`)
        .set(bearer(admin))
        .expect(200);
      expect(read.body.requirements).toEqual(requirements);
      await http.get(`/tenant/locations/${siteA}/staffing`).set(bearer(rivalAdmin)).expect(404);
    });

    it('copies last week into this week once, skipping clashes the second time', async () => {
      const officer = await hire('CP-1', tenant.idEntityId, { locationId: siteC });
      await shift({
        locationId: siteC,
        employeeId: officer.id,
        date: '2026-12-07',
        startTime: '08:00',
        durationHours: 12,
        kind: 'day',
      }).expect(201);
      const week = { locationId: siteC, from: '2026-12-14', to: '2026-12-20' };
      const first = await http
        .post('/tenant/roster/copy')
        .set(bearer(admin))
        .send(week)
        .expect(200);
      expect(first.body).toEqual({ copied: 1, skipped: 0 });
      const second = await http
        .post('/tenant/roster/copy')
        .set(bearer(admin))
        .send(week)
        .expect(200);
      expect(second.body).toEqual({ copied: 0, skipped: 1 });
      const roster = await http
        .get(`/tenant/roster?locationId=${siteC}&from=2026-12-14&to=2026-12-20`)
        .set(bearer(admin))
        .expect(200);
      expect(roster.body).toEqual([
        expect.objectContaining({ localDate: '2026-12-14', localStart: '08:00', status: 'draft' }),
      ]);
    });

    it('warns about too little rest between two shifts', async () => {
      const officer = await hire('RS-1', tenant.idEntityId, { locationId: siteC });
      for (const [date, startTime] of [
        ['2026-12-21', '08:00'],
        ['2026-12-21', '23:00'],
      ] as const) {
        await shift({
          locationId: siteC,
          employeeId: officer.id,
          date,
          startTime,
          durationHours: 8,
          kind: 'custom',
        }).expect(201);
      }
      const res = await http
        .get(`/tenant/roster/conflicts?locationId=${siteC}&from=2026-12-21&to=2026-12-27`)
        .set(bearer(admin))
        .expect(200);
      expect(res.body.conflicts).toEqual([
        expect.objectContaining({ kind: 'rest', employeeId: officer.id, detail: 7 }),
      ]);
    });
  });

  describe('batch and cleared sites', () => {
    it('applies a batch all or nothing, replacing drafts in place', async () => {
      const officer = await hire('BT-1', tenant.idEntityId, { locationId: siteC });
      const first = await shift({
        locationId: siteC,
        employeeId: officer.id,
        date: '2027-01-04',
        startTime: '08:00',
        durationHours: 12,
        kind: 'day',
      }).expect(201);
      const item = (date: string, extra: Record<string, unknown> = {}) => ({
        locationId: siteC,
        employeeId: officer.id,
        date,
        startTime: '20:00',
        durationHours: 12,
        kind: 'night',
        ...extra,
      });
      const roster = () =>
        http
          .get(`/tenant/roster?locationId=${siteC}&from=2027-01-04&to=2027-01-10`)
          .set(bearer(admin))
          .expect(200)
          .then((r) =>
            r.body.map((s: { localDate: string; kind: string }) => `${s.localDate} ${s.kind}`),
          );

      // The second item clashes with the first: nothing may change, not even the replaced draft.
      const failed = await http
        .post('/tenant/shifts/batch')
        .set(bearer(admin))
        .send({
          items: [
            item('2027-01-04', { replaceShiftId: first.body.id }),
            item('2027-01-04', { startTime: '22:00', durationHours: 4, kind: 'custom' }),
          ],
        })
        .expect(409);
      expect(failed.body).toMatchObject({ code: 'shift_overlap', index: 1 });
      expect(await roster()).toEqual(['2027-01-04 day']);

      const done = await http
        .post('/tenant/shifts/batch')
        .set(bearer(admin))
        .send({
          items: [item('2027-01-04', { replaceShiftId: first.body.id }), item('2027-01-05')],
        })
        .expect(201);
      expect(done.body).toHaveLength(2);
      expect(await roster()).toEqual(['2027-01-04 night', '2027-01-05 night']);
    });

    it('stores cleared sites of the same legal entity only', async () => {
      const officer = await hire('CL-1', tenant.idEntityId, { locationId: siteA });
      const foreign = await http
        .patch(`/tenant/employees/${officer.id}`)
        .set(bearer(admin))
        .send({ siteIds: [rivalSite] })
        .expect(404);
      expect(foreign.body.code).toBe('location_not_found');
      await http
        .patch(`/tenant/employees/${officer.id}`)
        .set(bearer(admin))
        .send({ siteIds: [sgSite] })
        .expect(422);
      const saved = await http
        .patch(`/tenant/employees/${officer.id}`)
        .set(bearer(admin))
        .send({ siteIds: [siteB] })
        .expect(200);
      expect(saved.body.siteIds).toEqual([siteB]);

      // Main site A and cleared site B are fine; site C is flagged.
      for (const [locationId, date] of [
        [siteA, '2027-02-01'],
        [siteB, '2027-02-02'],
        [siteC, '2027-02-03'],
      ] as const) {
        await shift({
          locationId,
          employeeId: officer.id,
          date,
          startTime: '08:00',
          durationHours: 8,
          kind: 'day',
        }).expect(201);
      }
      const conflicts = await http
        .get(`/tenant/roster/conflicts?locationId=${siteC}&from=2027-02-01&to=2027-02-07`)
        .set(bearer(admin))
        .expect(200);
      expect(
        conflicts.body.conflicts
          .filter((c: { kind: string; employeeId: string }) => c.employeeId === officer.id)
          .map((c: { kind: string; localDate: string }) => `${c.kind} ${c.localDate}`),
      ).toEqual(['site_not_allowed 2027-02-03']);
    });
  });
});
