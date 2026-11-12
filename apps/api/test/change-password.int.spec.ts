import type { INestApplication } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import type { TokenPair } from '@xrostr/contracts';
import pg from 'pg';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { startApp, totpCode } from './support/test-app.js';

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const ADMIN = { email: 'password-admin@xrostr.test', password: 'Initial-Password-2026' };
const NEW_PASSWORD = 'Replaced-Password-2026';

describe('changing the password', () => {
  const owner = new pg.Pool({ connectionString: inject('ownerUrl'), max: 1 });
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let secret: string;
  let tokens: TokenPair;

  beforeAll(async () => {
    await owner.query(
      `insert into platform_admins (id, email, full_name, password_hash)
       values (gen_random_uuid(), $1, 'Password Admin', $2)`,
      [ADMIN.email, await hash(ADMIN.password)],
    );
    ({ app, http } = await startApp());
  });

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('is blocked until 2FA is enrolled', async () => {
    const login = await http.post('/platform/auth/login').send(ADMIN).expect(200);
    const blocked = await http
      .post('/auth/change-password')
      .set(bearer(login.body.accessToken))
      .send({ currentPassword: ADMIN.password, newPassword: NEW_PASSWORD })
      .expect(403);
    expect(blocked.body.code).toBe('mfa_enrollment_required');

    const setup = await http
      .post('/auth/mfa/setup')
      .set(bearer(login.body.accessToken))
      .expect(200);
    secret = setup.body.secret;
    tokens = (
      await http
        .post('/auth/mfa/enable')
        .set(bearer(login.body.accessToken))
        .send({ code: totpCode(secret) })
        .expect(200)
    ).body;
  });

  it('rejects a wrong current password without signing the caller out', async () => {
    const res = await http
      .post('/auth/change-password')
      .set(bearer(tokens.accessToken))
      .send({ currentPassword: 'not-the-password-1', newPassword: NEW_PASSWORD })
      .expect(403);
    expect(res.body.code).toBe('invalid_current_password');
    await http.get('/auth/me').set(bearer(tokens.accessToken)).expect(200);
  });

  it('rejects a weak password or the same password', async () => {
    for (const newPassword of ['1234567', ADMIN.password]) {
      const res = await http
        .post('/auth/change-password')
        .set(bearer(tokens.accessToken))
        .send({ currentPassword: ADMIN.password, newPassword })
        .expect(422);
      expect(res.body.code).toBe('invalid_request');
    }
  });

  it('replaces the password and signs out every other session', async () => {
    const other = await http
      .post('/platform/auth/login')
      .send({ ...ADMIN, totpCode: totpCode(secret) })
      .expect(200);

    const changed = await http
      .post('/auth/change-password')
      .set(bearer(tokens.accessToken))
      .send({ currentPassword: ADMIN.password, newPassword: NEW_PASSWORD })
      .expect(200);
    expect(changed.body.stage).toBe('full');

    await http.post('/auth/refresh').send({ refreshToken: other.body.refreshToken }).expect(401);
    await http.post('/auth/refresh').send({ refreshToken: tokens.refreshToken }).expect(401);
    await http.post('/auth/refresh').send({ refreshToken: changed.body.refreshToken }).expect(200);

    const oldLogin = await http
      .post('/platform/auth/login')
      .send({ ...ADMIN, totpCode: totpCode(secret) })
      .expect(401);
    expect(oldLogin.body.code).toBe('invalid_credentials');
    await http
      .post('/platform/auth/login')
      .send({ email: ADMIN.email, password: NEW_PASSWORD, totpCode: totpCode(secret) })
      .expect(200);

    const audit = await owner.query(
      `select 1 from platform_audit_log where action = 'auth.password_changed'`,
    );
    expect(audit.rowCount).toBe(1);
  });
});
