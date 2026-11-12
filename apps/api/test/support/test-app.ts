import type { INestApplication } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import * as OTPAuth from 'otpauth';
import type pg from 'pg';
import request from 'supertest';
import { inject } from 'vitest';
import { createApp } from '../../src/bootstrap.js';
import type { AppConfig } from '../../src/shared/config/app-config.js';

export const SUPERADMIN = { email: 'root@inroster.test', password: 'Superadmin-Password-1' };

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    env: 'test',
    port: 0,
    databaseUrl: inject('appUrl'),
    jwt: {
      secret: 'test-secret-test-secret-test-secret-123',
      issuer: 'inroster-test',
      accessTtlSeconds: 900,
      refreshTtlSeconds: 3600,
    },
    fieldEncryptionKey: Buffer.alloc(32, 7),
    rateLimitEnabled: false,
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
