import type { INestApplication } from '@nestjs/common';
import type { PatrolRouteView, PatrolTag } from '@xrostr/contracts';
import pg from 'pg';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { seedTenant, seedUser, signIn, startApp } from './support/test-app.js';

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const PASSWORD = 'Patrol-Password-2026';
const TZ = 'Asia/Jakarta';
const SITE = { latitude: -6.2088, longitude: 106.8456 };
// About 10 m north of the site point, and about 2 km away.
const NEAR = { latitude: -6.2087, longitude: 106.8456, accuracy: 8 };
const FAR = { latitude: -6.19, longitude: 106.8456, accuracy: 8 };

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

describe('patrol: routes, checkpoint tags, rounds and monitoring', () => {
  const owner = new pg.Pool({ connectionString: inject('ownerUrl'), max: 1 });
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let tenant: Awaited<ReturnType<typeof seedTenant>>;
  let admin: string;
  let supervisor: string;
  let officer: string;
  let idle: string;
  let site: string;
  let route: PatrolRouteView;
  const tags: Record<string, string> = {};

  const scan = (token: string, name: string, position: Record<string, number> = {}) =>
    http
      .post('/me/patrol/scans')
      .set(bearer(token))
      .send({ tag: tags[name], ...position });

  beforeAll(async () => {
    tenant = await seedTenant(owner, 'patroli-co');
    await seedUser(owner, tenant, 'tenant_admin', 'admin@patroli.test', PASSWORD);
    await seedUser(owner, tenant, 'supervisor', 'spv@patroli.test', PASSWORD);
    ({ app, http } = await startApp());
    admin = await signIn(http, 'patroli-co', 'admin@patroli.test', PASSWORD);
    supervisor = await signIn(http, 'patroli-co', 'spv@patroli.test', PASSWORD);

    site = (
      await http
        .post('/tenant/locations')
        .set(bearer(admin))
        .send({
          name: 'Menara Sudirman',
          code: 'JKT-01',
          legalEntityId: tenant.idEntityId,
          timezone: TZ,
          ...SITE,
          geofenceRadiusM: 150,
        })
        .expect(201)
    ).body.id;

    const hire = async (no: string) => {
      const email = `${no.toLowerCase()}@patroli.test`;
      const res = await http
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          fullName: `Officer ${no}`,
          email,
          employeeNo: no,
          legalEntityId: tenant.idEntityId,
          employmentType: 'full_time',
          startDate: '2025-01-01',
          role: 'employee',
        })
        .expect(201);
      await http
        .post('/auth/accept-invite')
        .send({ inviteToken: res.body.inviteToken, password: PASSWORD })
        .expect(200);
      return {
        id: res.body.employeeId as string,
        token: await signIn(http, 'patroli-co', email, PASSWORD),
      };
    };
    const so = await hire('SO-1');
    officer = so.token;
    idle = (await hire('SO-2')).token;

    // A published shift for SO-1 that began 10 minutes ago.
    const started = siteClock(-10);
    await http
      .post('/tenant/shifts')
      .set(bearer(admin))
      .send({
        locationId: site,
        employeeId: so.id,
        date: started.date,
        startTime: started.time,
        durationHours: 8,
        kind: 'custom',
      })
      .expect(201);
    await http
      .post('/tenant/roster/publish')
      .set(bearer(admin))
      .send({ locationId: site, from: started.date, to: started.date })
      .expect(200);
  });

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('lets a supervisor build a route with checkpoints in walking order', async () => {
    route = (
      await http
        .post('/tenant/patrol/routes')
        .set(bearer(supervisor))
        .send({ locationId: site, name: 'Keliling malam', intervalMinutes: 120 })
        .expect(201)
    ).body;
    const dup = await http
      .post('/tenant/patrol/routes')
      .set(bearer(supervisor))
      .send({ locationId: site, name: 'Keliling malam' })
      .expect(409);
    expect(dup.body.code).toBe('patrol_route_name_taken');

    const add = (body: Record<string, unknown>) =>
      http
        .post(`/tenant/patrol/routes/${route.id}/checkpoints`)
        .set(bearer(supervisor))
        .send(body)
        .expect(201);
    await add({ name: 'Lobi', ...SITE, radiusM: 30 });
    await add({ name: 'Basement' });
    route = (await add({ name: 'Atap', ...SITE })).body;
    expect(route.checkpoints.map((c) => [c.name, c.position])).toEqual([
      ['Lobi', 1],
      ['Basement', 2],
      ['Atap', 3],
    ]);

    const [lobi, basement, atap] = route.checkpoints.map((c) => c.id);
    await http
      .put(`/tenant/patrol/routes/${route.id}/order`)
      .set(bearer(supervisor))
      .send({ checkpointIds: [atap, lobi] })
      .expect(422);
    route = (
      await http
        .put(`/tenant/patrol/routes/${route.id}/order`)
        .set(bearer(supervisor))
        .send({ checkpointIds: [atap, lobi, basement] })
        .expect(200)
    ).body;
    expect(route.checkpoints.map((c) => c.name)).toEqual(['Atap', 'Lobi', 'Basement']);
    const read = await http
      .get(`/tenant/patrol/routes/${route.id}`)
      .set(bearer(supervisor))
      .expect(200);
    expect(read.body).toEqual(route);
  });

  it('gives planners the tag links, and only planners', async () => {
    const res = await http
      .get(`/tenant/patrol/routes/${route.id}/tags`)
      .set(bearer(supervisor))
      .expect(200);
    for (const tag of res.body as PatrolTag[]) {
      expect(tag.path).toMatch(/^\/patrol\?k=[0-9a-f]{64}$/);
      tags[tag.name] = new URLSearchParams(tag.path.split('?')[1]).get('k')!;
    }
    expect(Object.keys(tags)).toEqual(['Atap', 'Lobi', 'Basement']);
    await http.get(`/tenant/patrol/routes/${route.id}/tags`).set(bearer(officer)).expect(403);
    // Route views never carry the secrets.
    expect(JSON.stringify(route)).not.toContain(tags.Lobi);
  });

  it('refuses scans outside a shift at the site and unknown tags', async () => {
    const idleScan = await scan(idle, 'Lobi', NEAR).expect(422);
    expect(idleScan.body.code).toBe('patrol_outside_shift');
    const bad = await http
      .post('/me/patrol/scans')
      .set(bearer(officer))
      .send({ tag: 'f'.repeat(64) })
      .expect(422);
    expect(bad.body.code).toBe('invalid_patrol_tag');
  });

  it('starts a round on the first scan and points to the next checkpoint', async () => {
    const res = await scan(officer, 'Lobi', NEAR).expect(200);
    expect(res.body).toMatchObject({
      checkpoint: { name: 'Lobi' },
      alreadyScanned: false,
      locationVerified: true,
      round: { status: 'in_progress', scanned: 1, total: 3, next: { name: 'Atap' } },
    });
    expect(res.body.distanceM).toBeLessThan(20);

    const again = await scan(officer, 'Lobi', NEAR).expect(200);
    expect(again.body).toMatchObject({ alreadyScanned: true, round: { scanned: 1 } });
  });

  it('records a far-away scan but flags it', async () => {
    const res = await scan(officer, 'Atap', FAR).expect(200);
    expect(res.body.locationVerified).toBe(false);
    expect(res.body.distanceM).toBeGreaterThan(1500);

    const mine = await http.get('/me/patrol').set(bearer(officer)).expect(200);
    expect(mine.body.shift).toMatchObject({ locationName: 'Menara Sudirman', timezone: TZ });
    expect(mine.body.routes[0]).toMatchObject({
      route: { name: 'Keliling malam', intervalMinutes: 120 },
      round: { scanned: 2, total: 3, next: { name: 'Basement' } },
    });
  });

  it('completes the round when the last checkpoint is scanned, even without GPS', async () => {
    const res = await scan(officer, 'Basement').expect(200);
    expect(res.body).toMatchObject({
      locationVerified: null,
      distanceM: null,
      round: { status: 'completed', scanned: 3, next: null },
    });
    expect(res.body.round.finishedAt).toBeTruthy();
  });

  it('starts a fresh round afterwards, which the officer can end early', async () => {
    const res = await scan(officer, 'Lobi', NEAR).expect(200);
    expect(res.body.round).toMatchObject({ status: 'in_progress', scanned: 1 });
    const done = await http
      .post(`/me/patrol/rounds/${res.body.round.roundId}/finish`)
      .set(bearer(officer))
      .expect(200);
    expect(done.body.status).toBe('incomplete');
    await http
      .post(`/me/patrol/rounds/${res.body.round.roundId}/finish`)
      .set(bearer(officer))
      .expect(409);
    await http
      .post(`/me/patrol/rounds/${res.body.round.roundId}/finish`)
      .set(bearer(idle))
      .expect(404);
  });

  it('shows supervisors every round with what was missed', async () => {
    const today = siteClock(0).date;
    const res = await http
      .get(`/tenant/patrol/rounds?locationId=${site}&from=${today}&to=${today}`)
      .set(bearer(supervisor))
      .expect(200);
    expect(res.body).toHaveLength(2);
    const [latest, first] = res.body;
    expect(latest).toMatchObject({
      status: 'incomplete',
      employee: { employeeNo: 'SO-1' },
      missed: ['Atap', 'Basement'],
    });
    expect(first.status).toBe('completed');
    expect(
      first.scans.map((s: { name: string; locationVerified: boolean | null }) => [
        s.name,
        s.locationVerified,
      ]),
    ).toEqual([
      ['Lobi', true],
      ['Atap', false],
      ['Basement', null],
    ]);
    await http
      .get(`/tenant/patrol/rounds?locationId=${site}&from=${today}&to=${today}`)
      .set(bearer(officer))
      .expect(403);
  });

  it('voids an old tag when it is rotated, and drops archived checkpoints from the tags', async () => {
    const lobi = route.checkpoints.find((c) => c.name === 'Lobi')!;
    const rotated = await http
      .post(`/tenant/patrol/checkpoints/${lobi.id}/tag/rotate`)
      .set(bearer(supervisor))
      .expect(200);
    expect(rotated.body.path).not.toContain(tags.Lobi);
    const old = await scan(officer, 'Lobi', NEAR).expect(422);
    expect(old.body.code).toBe('invalid_patrol_tag');

    const basement = route.checkpoints.find((c) => c.name === 'Basement')!;
    await http
      .patch(`/tenant/patrol/checkpoints/${basement.id}`)
      .set(bearer(supervisor))
      .send({ status: 'archived' })
      .expect(200);
    const remaining = await http
      .get(`/tenant/patrol/routes/${route.id}/tags`)
      .set(bearer(supervisor))
      .expect(200);
    expect(remaining.body.map((t: PatrolTag) => t.name)).toEqual(['Atap', 'Lobi']);
  });

  it('keeps routes private to their company', async () => {
    const other = await seedTenant(owner, 'patroli-rival');
    await seedUser(owner, other, 'supervisor', 'spv@rival-patroli.test', PASSWORD);
    const rival = await signIn(http, 'patroli-rival', 'spv@rival-patroli.test', PASSWORD);
    const res = await http
      .get(`/tenant/patrol/routes?locationId=${site}`)
      .set(bearer(rival))
      .expect(404);
    expect(res.body.code).toBe('location_not_found');
    await http
      .patch(`/tenant/patrol/routes/${route.id}`)
      .set(bearer(rival))
      .send({ name: 'Diambil alih' })
      .expect(404);
  });
});
