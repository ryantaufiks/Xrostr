import type { INestApplication } from '@nestjs/common';
import type { CreateTenantRequest, TokenPair } from '@xrostr/contracts';
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

  describe('superadmin edits an existing tenant', () => {
    const platform = () => bearer(superadmin.accessToken);
    let c: { id: string; adminId: string; invite: string };

    beforeAll(async () => {
      const res = await http
        .post('/platform/tenants')
        .set(platform())
        .send(tenantRequest('tenant-c', 'admin@c.test'))
        .expect(201);
      c = {
        id: res.body.tenantId,
        adminId: res.body.firstAdminUserId,
        invite: res.body.inviteToken,
      };
    });

    it('shows a tenant with its legal entities and administrators', async () => {
      const res = await http.get(`/platform/tenants/${c.id}`).set(platform()).expect(200);
      expect(res.body).toMatchObject({ slug: 'tenant-c', status: 'active' });
      expect(
        res.body.legalEntities.map((e: { countryCode: string }) => e.countryCode).sort(),
      ).toEqual(['ID', 'SG']);
      expect(res.body.admins).toEqual([
        { userId: c.adminId, email: 'admin@c.test', fullName: 'Admin tenant-c', status: 'invited' },
      ]);
      await http
        .get('/platform/tenants/00000000-0000-4000-8000-000000000000')
        .set(platform())
        .expect(404);
    });

    it('renames and changes the plan, but never the slug', async () => {
      const res = await http
        .patch(`/platform/tenants/${c.id}`)
        .set(platform())
        .send({ name: 'Tenant C Renamed', plan: 'enterprise', slug: 'hijack' })
        .expect(200);
      expect(res.body).toMatchObject({
        name: 'Tenant C Renamed',
        plan: 'enterprise',
        slug: 'tenant-c',
      });
      await http.patch(`/platform/tenants/${c.id}`).set(platform()).send({}).expect(422);
      await http
        .patch(`/platform/tenants/${c.id}`)
        .set(bearer(tenants.b.tokens!.accessToken))
        .send({ name: 'Nope' })
        .expect(403);
    });

    it('adds a legal entity and refuses a duplicate name', async () => {
      const res = await http
        .post(`/platform/tenants/${c.id}/legal-entities`)
        .set(platform())
        .send({ name: 'PT Tenant C Jawa', countryCode: 'ID' })
        .expect(201);
      expect(res.body.legalEntities).toHaveLength(3);
      const dup = await http
        .post(`/platform/tenants/${c.id}/legal-entities`)
        .set(platform())
        .send({ name: 'pt tenant c jawa', countryCode: 'ID' })
        .expect(409);
      expect(dup.body.code).toBe('duplicate_legal_entity');
    });

    it('re-issues the admin invite and voids the old link', async () => {
      const res = await http
        .post(`/platform/tenants/${c.id}/admins/${c.adminId}/invite`)
        .set(platform())
        .expect(200);
      await http
        .post('/auth/accept-invite')
        .send({ inviteToken: c.invite, password: ADMIN_PASSWORD })
        .expect(404);
      await http
        .post('/auth/accept-invite')
        .send({ inviteToken: res.body.inviteToken, password: ADMIN_PASSWORD })
        .expect(200);
      const again = await http
        .post(`/platform/tenants/${c.id}/admins/${c.adminId}/invite`)
        .set(platform())
        .expect(409);
      expect(again.body.code).toBe('user_already_active');
    });

    it('suspends a tenant: sessions end and sign-in is refused until reactivated', async () => {
      const signIn = () =>
        http
          .post('/auth/login')
          .send({ tenantSlug: 'tenant-c', email: 'admin@c.test', password: ADMIN_PASSWORD });
      const session = (await signIn().expect(200)).body as TokenPair;

      const suspended = await http
        .patch(`/platform/tenants/${c.id}`)
        .set(platform())
        .send({ status: 'suspended' })
        .expect(200);
      expect(suspended.body.status).toBe('suspended');
      await http.post('/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
      await signIn().expect(401);

      await http
        .patch(`/platform/tenants/${c.id}`)
        .set(platform())
        .send({ status: 'active' })
        .expect(200);
      await signIn().expect(200);
      const audit = await owner.query(
        `select action from platform_audit_log where tenant_id = $1 and action like 'tenant.%' order by created_at`,
        [c.id],
      );
      expect(audit.rows.map((r) => r.action)).toEqual([
        'tenant.created',
        'tenant.updated',
        'tenant.legal_entity_added',
        'tenant.admin_invite_reissued',
        'tenant.suspended',
        'tenant.reactivated',
      ]);
    });
  });
});
