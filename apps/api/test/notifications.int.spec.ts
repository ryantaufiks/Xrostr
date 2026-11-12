import type { INestApplication } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import pg from 'pg';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { startApp } from './support/test-app.js';

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const OFFICER = { email: 'officer@notif.test', password: 'Officer-Password-2026' };
const SUBSCRIPTION = {
  endpoint: 'https://push.example/device-1',
  keys: { p256dh: 'BPublicKeyOfTheDevice', auth: 'secret-auth' },
};

describe('notifications', () => {
  const owner = new pg.Pool({ connectionString: inject('ownerUrl'), max: 1 });
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let token: string;
  let tenantId: string;

  beforeAll(async () => {
    // An officer: role "employee", which does not require 2FA.
    tenantId = (
      await owner.query<{ id: string }>(
        `insert into tenants (id, name, slug, data_region, plan) values (gen_random_uuid(), 'Notif', 'notif-co', 'id', 'growth') returning id`,
      )
    ).rows[0]!.id;
    const userId = (
      await owner.query<{ id: string }>(
        `insert into users (id, tenant_id, email, full_name, password_hash, status)
         values (gen_random_uuid(), $1, $2, 'Pak Officer', $3, 'active') returning id`,
        [tenantId, OFFICER.email, await hash(OFFICER.password)],
      )
    ).rows[0]!.id;
    const roleId = (
      await owner.query<{ id: string }>(
        `insert into roles (id, tenant_id, key, name, permissions, is_system, mfa_required)
         values (gen_random_uuid(), $1, 'employee', 'Employee', '{}', true, false) returning id`,
        [tenantId],
      )
    ).rows[0]!.id;
    await owner.query(`insert into user_roles (tenant_id, user_id, role_id) values ($1, $2, $3)`, [
      tenantId,
      userId,
      roleId,
    ]);

    ({ app, http } = await startApp());
    const login = await http
      .post('/auth/login')
      .send({ tenantSlug: 'notif-co', ...OFFICER })
      .expect(200);
    expect(login.body.stage).toBe('full');
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  it('serves the VAPID public key', async () => {
    const res = await http.get('/notifications/push/public-key').set(bearer(token)).expect(200);
    expect(res.body).toEqual({ publicKey: 'test-public-key' });
  });

  it('stores a device subscription once, however often it is sent', async () => {
    await http
      .post('/notifications/push/subscriptions')
      .set(bearer(token))
      .send(SUBSCRIPTION)
      .expect(204);
    await http
      .post('/notifications/push/subscriptions')
      .set(bearer(token))
      .send(SUBSCRIPTION)
      .expect(204);
    const rows = await owner.query('select endpoint from push_subscriptions where tenant_id = $1', [
      tenantId,
    ]);
    expect(rows.rowCount).toBe(1);

    await http
      .post('/notifications/push/subscriptions')
      .set(bearer(token))
      .send({ endpoint: 'not-a-url', keys: {} })
      .expect(422);
  });

  it('puts a test notification in the inbox and queues it for push', async () => {
    await http.post('/notifications/test').set(bearer(token)).expect(204);

    const inbox = await http.get('/notifications').set(bearer(token)).expect(200);
    expect(inbox.body.unread).toBe(1);
    expect(inbox.body.items[0]).toMatchObject({
      kind: 'test',
      title: 'Notifikasi aktif',
      readAt: null,
    });

    const queued = await owner.query(
      `select payload from outbox_events where type = 'notification.created' and tenant_id = $1`,
      [tenantId],
    );
    expect(queued.rows[0]!.payload).toMatchObject({ notificationId: inbox.body.items[0].id });

    await http.post('/notifications/read-all').set(bearer(token)).expect(204);
    const after = await http.get('/notifications').set(bearer(token)).expect(200);
    expect(after.body.unread).toBe(0);
  });

  it('removes a subscription', async () => {
    await http
      .delete('/notifications/push/subscriptions')
      .set(bearer(token))
      .send({ endpoint: SUBSCRIPTION.endpoint })
      .expect(204);
    const rows = await owner.query('select 1 from push_subscriptions where tenant_id = $1', [
      tenantId,
    ]);
    expect(rows.rowCount).toBe(0);
  });

  it('follows the tenant language until the person picks their own', async () => {
    const me = await http.get('/auth/me').set(bearer(token)).expect(200);
    expect(me.body.locale).toEqual({ locale: 'id', preferred: null, default: 'id' });

    const chosen = await http
      .put('/auth/me/locale')
      .set(bearer(token))
      .send({ locale: 'en' })
      .expect(200);
    expect(chosen.body).toEqual({ locale: 'en', preferred: 'en', default: 'id' });
    await http.put('/auth/me/locale').set(bearer(token)).send({ locale: 'fr' }).expect(422);
  });

  it('writes notifications in the reader’s language', async () => {
    await http.post('/notifications/test').set(bearer(token)).expect(204);
    const latest = await owner.query(
      `select title from notifications where tenant_id = $1 order by created_at desc limit 1`,
      [tenantId],
    );
    expect(latest.rows[0].title).toBe('Notifications are on');

    await http.put('/auth/me/locale').set(bearer(token)).send({ locale: null }).expect(200);
    await http.post('/notifications/test').set(bearer(token)).expect(204);
    const again = await owner.query(
      `select title from notifications where tenant_id = $1 order by created_at desc limit 1`,
      [tenantId],
    );
    expect(again.rows[0].title).toBe('Notifikasi aktif');
  });
});
