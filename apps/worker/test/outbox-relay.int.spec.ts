import { createDatabase, outboxEvents, type DatabaseHandle } from '@inroster/db';
import { migrateDatabase } from '@inroster/db/migrate';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OutboxRelay, type EventHandler } from '../src/outbox-relay.js';

describe('OutboxRelay', () => {
  let container: StartedPostgreSqlContainer;
  let handle: DatabaseHandle;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine')
      .withUsername('hrms_owner')
      .start();
    await migrateDatabase({ ownerUrl: container.getConnectionUri(), appPassword: 'app' });
    const appUrl = new URL(container.getConnectionUri());
    appUrl.username = 'hrms_app';
    appUrl.password = 'app';
    handle = createDatabase(appUrl.toString(), { max: 2 });
  }, 180_000);

  afterAll(async () => {
    await handle?.close();
    await container?.stop();
  });

  beforeEach(async () => {
    await handle.db.delete(outboxEvents);
  });

  const enqueue = (type: string) =>
    handle.db
      .insert(outboxEvents)
      .values({ type, tenantId: null, payload: { n: 1 } })
      .returning({ id: outboxEvents.id })
      .then((rows) => rows[0]!.id);

  it('delivers each pending event once and marks it processed', async () => {
    const seen: string[] = [];
    const id = await enqueue('tenant.created');
    const relay = new OutboxRelay(
      handle.db,
      new Map([['tenant.created', [async (e) => void seen.push(e.id)]]]),
    );

    expect(await relay.tick()).toBe(1);
    expect(await relay.tick()).toBe(0);
    expect(seen).toEqual([id]);
    const [row] = await handle.db.select().from(outboxEvents).where(eq(outboxEvents.id, id));
    expect(row!.processedAt).not.toBeNull();
  });

  it('records the error and backs off when a handler fails', async () => {
    const id = await enqueue('tenant.created');
    const failing: EventHandler = async () => {
      throw new Error('smtp down');
    };
    const relay = new OutboxRelay(handle.db, new Map([['tenant.created', [failing]]]));

    expect(await relay.tick()).toBe(1);
    const [row] = await handle.db.select().from(outboxEvents).where(eq(outboxEvents.id, id));
    expect(row).toMatchObject({ attempts: 1, lastError: 'smtp down', processedAt: null });
    expect(row!.availableAt.getTime()).toBeGreaterThan(Date.now());
    // Not yet due again, so the next tick skips it.
    expect(await relay.tick()).toBe(0);
  });

  it('parks events that reached the attempt limit', async () => {
    const id = await enqueue('tenant.created');
    await handle.db.update(outboxEvents).set({ attempts: 3 }).where(eq(outboxEvents.id, id));
    const relay = new OutboxRelay(handle.db, new Map(), { batchSize: 10, maxAttempts: 3 });
    expect(await relay.tick()).toBe(0);
  });
});
