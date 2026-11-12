import { createDatabase, type DatabaseHandle } from '@xrostr/db';
import { migrateDatabase } from '@xrostr/db/migrate';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OutboxEvent } from '../src/outbox-relay.js';
import { PushDelivery, type PushSender, type PushTarget } from '../src/push-delivery.js';

class FakeSender implements PushSender {
  readonly sent: { endpoint: string; payload: unknown }[] = [];
  constructor(private readonly gone: Set<string>) {}

  async send(target: PushTarget, payload: string): Promise<void> {
    if (this.gone.has(target.endpoint)) {
      throw Object.assign(new Error('Gone'), { statusCode: 410 });
    }
    this.sent.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
  }
}

describe('PushDelivery', () => {
  let container: StartedPostgreSqlContainer;
  let owner: pg.Pool;
  let app: DatabaseHandle;
  let tenantA: string;
  let tenantB: string;
  let userA: string;
  let userB: string;

  const insert = async (sqlText: string, values: unknown[]) =>
    (await owner.query<{ id: string }>(sqlText, values)).rows[0]!.id;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine')
      .withUsername('xrostr_owner')
      .start();
    await migrateDatabase({ ownerUrl: container.getConnectionUri(), appPassword: 'app' });
    owner = new pg.Pool({ connectionString: container.getConnectionUri(), max: 1 });
    const appUrl = new URL(container.getConnectionUri());
    appUrl.username = 'xrostr_app';
    appUrl.password = 'app';
    app = createDatabase(appUrl.toString(), { max: 2 });

    const tenant = (slug: string) =>
      insert(
        `insert into tenants (id, name, slug, data_region, plan) values (gen_random_uuid(), $1, $1, 'id', 'growth') returning id`,
        [slug],
      );
    const user = (tenantId: string, email: string) =>
      insert(
        `insert into users (id, tenant_id, email, full_name, status) values (gen_random_uuid(), $1, $2, 'Officer', 'active') returning id`,
        [tenantId, email],
      );
    tenantA = await tenant('push-a');
    tenantB = await tenant('push-b');
    userA = await user(tenantA, 'a@push.test');
    userB = await user(tenantB, 'b@push.test');
    for (const endpoint of ['https://push.test/phone', 'https://push.test/old-tablet']) {
      await owner.query(
        `insert into push_subscriptions (id, tenant_id, user_id, endpoint, p256dh, auth) values (gen_random_uuid(), $1, $2, $3, 'k', 'a')`,
        [tenantA, userA, endpoint],
      );
    }
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await owner?.end();
    await container?.stop();
  });

  const notify = (tenantId: string, userId: string) =>
    insert(
      `insert into notifications (id, tenant_id, user_id, kind, title, body, url) values (gen_random_uuid(), $1, $2, 'shift', 'Jadwal baru', 'Shift malam Sabtu', '/tenant') returning id`,
      [tenantId, userId],
    );

  const event = (tenantId: string, notificationId: string, userId: string): OutboxEvent => ({
    id: 'evt',
    tenantId,
    type: 'notification.created',
    payload: { notificationId, userId },
    occurredAt: new Date(),
  });

  it('pushes to live devices and removes devices that are gone', async () => {
    const sender = new FakeSender(new Set(['https://push.test/old-tablet']));
    const delivery = new PushDelivery(app.db, sender, pino({ level: 'silent' }));
    const notificationId = await notify(tenantA, userA);

    await delivery.deliver(event(tenantA, notificationId, userA));

    expect(sender.sent).toEqual([
      {
        endpoint: 'https://push.test/phone',
        payload: {
          title: 'Jadwal baru',
          body: 'Shift malam Sabtu',
          url: '/tenant',
          tag: notificationId,
        },
      },
    ]);
    const left = await owner.query('select endpoint from push_subscriptions where user_id = $1', [
      userA,
    ]);
    expect(left.rows.map((r) => r.endpoint)).toEqual(['https://push.test/phone']);
  });

  it('cannot read another tenant’s notification even with its id', async () => {
    const sender = new FakeSender(new Set());
    const delivery = new PushDelivery(app.db, sender, pino({ level: 'silent' }));
    const foreign = await notify(tenantB, userB);

    // Event claims tenant A but points at tenant B's notification: RLS hides it.
    await delivery.deliver(event(tenantA, foreign, userB));
    expect(sender.sent).toEqual([]);
  });
});
