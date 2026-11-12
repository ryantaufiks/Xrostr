import type { INestApplication } from '@nestjs/common';
import type { CreateTenantRequest, TokenPair } from '@inroster/contracts';
import pg from 'pg';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { seedSuperadmin, startApp, SUPERADMIN, totpCode } from './support/test-app.js';

type Http = ReturnType<typeof request>;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const ADMIN_PASSWORD = 'Tenant-Admin-Password-1';

function tenantRequest(slug: string, email: string): CreateTenantRequest {
  return {
    name: `Tenant ${slug}`,
    slug,
    dataRegion: 'sg',
    plan: 'growth',
    legalEntities: [
      { name: `${slug} Security Pte Ltd`, countryCode: 'SG' },
      { name: `PT ${slug} Indonesia`, countryCode: 'ID' },
    ],
    firstAdmin: { email, fullName: `Admin ${slug}` },
  };
}

/** Enrols the caller in TOTP and returns the full-stage tokens plus the secret. */
async function enrolMfa(
  http: Http,
  restricted: TokenPair,
): Promise<{ tokens: TokenPair; secret: string }> {
  const setup = await http.post('/auth/mfa/setup').set(bearer(restricted.accessToken)).expect(200);
  const secret = setup.body.secret as string;
  const enabled = await http
    .post('/auth/mfa/enable')
    .set(bearer(restricted.accessToken))
    .send({ code: totpCode(secret) })
    .expect(200);
  return { tokens: enabled.body, secret };
}

describe('Phase 0: platform onboarding, auth and tenant isolation', () => {
  const owner = new pg.Pool({ connectionString: inject('ownerUrl'), max: 1 });
  let app: INestApplication;
  let http: Http;
  let superadmin: TokenPair;
  let superadminSecret: string;
  const tenants: Record<
    'a' | 'b',
    { id: string; adminId: string; invite: string; tokens?: TokenPair }
  > = {} as never;

  beforeAll(async () => {
    await seedSuperadmin(owner);
    ({ app, http } = await startApp());
  });

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('forces a superadmin to enrol in 2FA before anything else', async () => {
    const login = await http.post('/platform/auth/login').send(SUPERADMIN).expect(200);
    expect(login.body.stage).toBe('mfa_setup');

    const blocked = await http
      .get('/platform/tenants')
      .set(bearer(login.body.accessToken))
      .expect(403);
    expect(blocked.body.code).toBe('mfa_enrollment_required');
    expect(blocked.headers['content-type']).toContain('application/problem+json');

    ({ tokens: superadmin, secret: superadminSecret } = await enrolMfa(http, login.body));
    expect(superadmin.stage).toBe('full');
  });

  it('requires the TOTP code on later logins', async () => {
    const missing = await http.post('/platform/auth/login').send(SUPERADMIN).expect(401);
    expect(missing.body.code).toBe('mfa_required');
    const withCode = await http
      .post('/platform/auth/login')
      .send({ ...SUPERADMIN, totpCode: totpCode(superadminSecret) })
      .expect(200);
    expect(withCode.body.stage).toBe('full');
  });

  it('creates tenants with legal entities in two countries and invites the first admin', async () => {
    for (const key of ['a', 'b'] as const) {
      const res = await http
        .post('/platform/tenants')
        .set(bearer(superadmin.accessToken))
        .send(tenantRequest(`agency-${key}`, `admin@agency-${key}.test`))
        .expect(201);
      tenants[key] = {
        id: res.body.tenantId,
        adminId: res.body.firstAdminUserId,
        invite: res.body.inviteToken,
      };
    }
    const list = await http
      .get('/platform/tenants')
      .set(bearer(superadmin.accessToken))
      .expect(200);
    expect(list.body.map((t: { slug: string }) => t.slug)).toEqual(
      expect.arrayContaining(['agency-a', 'agency-b']),
    );

    const events = await owner.query(
      `select tenant_id from outbox_events where type = 'tenant.created'`,
    );
    expect(events.rows.map((r) => r.tenant_id)).toEqual(
      expect.arrayContaining([tenants.a.id, tenants.b.id]),
    );
  });

  it('rejects a duplicate or reserved slug', async () => {
    const dup = await http
      .post('/platform/tenants')
      .set(bearer(superadmin.accessToken))
      .send(tenantRequest('agency-a', 'other@agency-a.test'))
      .expect(409);
    expect(dup.body.code).toBe('slug_taken');
    const reserved = await http
      .post('/platform/tenants')
      .set(bearer(superadmin.accessToken))
      .send(tenantRequest('platform', 'x@platform.test'))
      .expect(422);
    expect(reserved.body.code).toBe('slug_reserved');
  });

  it('accepts an invite exactly once', async () => {
    for (const key of ['a', 'b'] as const) {
      await http
        .post('/auth/accept-invite')
        .send({ inviteToken: tenants[key].invite, password: ADMIN_PASSWORD })
        .expect(200);
    }
    const reused = await http
      .post('/auth/accept-invite')
      .send({ inviteToken: tenants.a.invite, password: ADMIN_PASSWORD })
      .expect(404);
    expect(reused.body.code).toBe('invalid_invite');
  });

  it('gives a tenant admin access only after 2FA, scoped to their own tenant', async () => {
    for (const key of ['a', 'b'] as const) {
      const login = await http
        .post('/auth/login')
        .send({
          tenantSlug: `agency-${key}`,
          email: `admin@agency-${key}.test`,
          password: ADMIN_PASSWORD,
        })
        .expect(200);
      expect(login.body.stage).toBe('mfa_setup');
      await http.get('/tenant/legal-entities').set(bearer(login.body.accessToken)).expect(403);
      tenants[key].tokens = (await enrolMfa(http, login.body)).tokens;
    }

    const entities = await http
      .get('/tenant/legal-entities')
      .set(bearer(tenants.a.tokens!.accessToken))
      .expect(200);
    expect(entities.body).toHaveLength(2);
    expect(entities.body.map((e: { currency: string }) => e.currency).sort()).toEqual([
      'IDR',
      'SGD',
    ]);
    expect(entities.body.every((e: { name: string }) => e.name.includes('agency-a'))).toBe(true);

    const auditB = await http
      .get('/tenant/audit-log')
      .set(bearer(tenants.b.tokens!.accessToken))
      .expect(200);
    expect(auditB.body.length).toBeGreaterThan(0);
    expect(auditB.body.some((r: { actorId: string }) => r.actorId === tenants.a.adminId)).toBe(
      false,
    );
  });

  it('keeps platform and tenant routes apart', async () => {
    const tenantOnPlatform = await http
      .get('/platform/tenants')
      .set(bearer(tenants.a.tokens!.accessToken))
      .expect(403);
    expect(tenantOnPlatform.body.code).toBe('platform_only');
    const platformOnTenant = await http
      .get('/tenant/audit-log')
      .set(bearer(superadmin.accessToken))
      .expect(403);
    expect(platformOnTenant.body.code).toBe('missing_permission');
  });

  it('rotates refresh tokens and revokes the family when an old one is replayed', async () => {
    const first = tenants.a.tokens!;
    const rotated = await http
      .post('/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);
    expect(rotated.body.refreshToken).not.toBe(first.refreshToken);

    const replay = await http
      .post('/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);
    expect(replay.body.code).toBe('invalid_refresh_token');
    // The legitimate newer token is now dead too: the whole family was revoked.
    await http.post('/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(401);

    const reuse = await owner.query(
      `select 1 from platform_audit_log where action = 'auth.refresh_token_reuse_detected'`,
    );
    expect(reuse.rowCount).toBe(1);
  });

  it('locks an account after five failed attempts', async () => {
    const attempt = () =>
      http.post('/auth/login').send({
        tenantSlug: 'agency-b',
        email: 'admin@agency-b.test',
        password: 'wrong-password-123',
      });
    for (let i = 0; i < 5; i++) await attempt().expect(401);
    const locked = await attempt().expect(423);
    expect(locked.body.code).toBe('account_locked');
  });

  it('gives the same answer for an unknown tenant, unknown user and wrong password', async () => {
    const bodies = await Promise.all([
      http
        .post('/auth/login')
        .send({ tenantSlug: 'nope', email: 'admin@agency-a.test', password: ADMIN_PASSWORD }),
      http
        .post('/auth/login')
        .send({ tenantSlug: 'agency-a', email: 'ghost@agency-a.test', password: ADMIN_PASSWORD }),
      http.post('/auth/login').send({
        tenantSlug: 'agency-a',
        email: 'admin@agency-a.test',
        password: 'wrong-password-123',
      }),
    ]);
    for (const res of bodies) {
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('invalid_credentials');
    }
  });
});
