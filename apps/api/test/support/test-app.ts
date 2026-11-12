import type { INestApplication } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import * as OTPAuth from 'otpauth';
import type pg from 'pg';
import { SYSTEM_ROLE_DEFINITIONS } from '@xrostr/contracts';
import request from 'supertest';
import { inject } from 'vitest';
import { createApp } from '../../src/bootstrap.js';
import type { AppConfig } from '../../src/shared/config/app-config.js';

export const SUPERADMIN = { email: 'root@xrostr.test', password: 'Superadmin-Password-1' };

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    env: 'test',
    host: '127.0.0.1',
    port: 0,
    databaseUrl: inject('appUrl'),
    jwt: {
      secret: 'test-secret-test-secret-test-secret-123',
      issuer: 'xrostr-test',
      accessTtlSeconds: 900,
      refreshTtlSeconds: 3600,
    },
    fieldEncryptionKey: Buffer.alloc(32, 7),
    rateLimitEnabled: false,
    vapidPublicKey: 'test-public-key',
    ...overrides,
  };
}

export async function startApp(
  overrides: Partial<AppConfig> = {},
): Promise<{ app: INestApplication; http: ReturnType<typeof request> }> {
  const app = await createApp(testConfig(overrides));
  await app.init();
  return { app, http: request(app.getHttpServer()) };
}

export async function seedSuperadmin(owner: pg.Pool): Promise<void> {
  await owner.query(
    `insert into platform_admins (id, email, full_name, password_hash) values (gen_random_uuid(), $1, 'Root', $2)
     on conflict (email) do nothing`,
    [SUPERADMIN.email, await hash(SUPERADMIN.password)],
  );
}

export function totpCode(secret: string): string {
  return new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    digits: 6,
    period: 30,
  }).generate();
}

/** A tenant with SG and ID legal entities and the built-in roles, inserted directly. */
export async function seedTenant(owner: pg.Pool, slug: string) {
  const one = async (sql: string, values: unknown[]) =>
    (await owner.query<{ id: string }>(sql, values)).rows[0]!.id;
  const tenantId = await one(
    `insert into tenants (id, name, slug, data_region, plan) values (gen_random_uuid(), $1, $1, 'id', 'growth') returning id`,
    [slug],
  );
  const entity = (name: string, country: string) =>
    one(
      `insert into legal_entities (id, tenant_id, name, country_code) values (gen_random_uuid(), $1, $2, $3) returning id`,
      [tenantId, name, country],
    );
  const sgEntityId = await entity(`${slug} Pte Ltd`, 'SG');
  const idEntityId = await entity(`PT ${slug}`, 'ID');
  const roleIds: Record<string, string> = {};
  for (const role of SYSTEM_ROLE_DEFINITIONS) {
    roleIds[role.key] = await one(
      `insert into roles (id, tenant_id, key, name, permissions, is_system, mfa_required)
       values (gen_random_uuid(), $1, $2, $3, $4, true, $5) returning id`,
      [tenantId, role.key, role.name, role.permissions, role.mfaRequired],
    );
  }
  return { tenantId, sgEntityId, idEntityId, roleIds };
}

/** An active user with a password and one role. */
export async function seedUser(
  owner: pg.Pool,
  tenant: { tenantId: string; roleIds: Record<string, string> },
  role: string,
  email: string,
  password: string,
): Promise<string> {
  const userId = (
    await owner.query<{ id: string }>(
      `insert into users (id, tenant_id, email, full_name, password_hash, status)
       values (gen_random_uuid(), $1, $2, $2, $3, 'active') returning id`,
      [tenant.tenantId, email, await hash(password)],
    )
  ).rows[0]!.id;
  await owner.query(`insert into user_roles (tenant_id, user_id, role_id) values ($1, $2, $3)`, [
    tenant.tenantId,
    userId,
    tenant.roleIds[role],
  ]);
  return userId;
}

/** Signs a tenant user in, enrolling 2FA first when their role requires it. */
export async function signIn(
  http: ReturnType<typeof request>,
  tenantSlug: string,
  email: string,
  password: string,
): Promise<string> {
  const login = await http.post('/auth/login').send({ tenantSlug, email, password }).expect(200);
  if (login.body.stage === 'full') return login.body.accessToken;
  const auth = { authorization: `Bearer ${login.body.accessToken}` };
  const setup = await http.post('/auth/mfa/setup').set(auth).expect(200);
  const enabled = await http
    .post('/auth/mfa/enable')
    .set(auth)
    .send({ code: totpCode(setup.body.secret) })
    .expect(200);
  return enabled.body.accessToken;
}
