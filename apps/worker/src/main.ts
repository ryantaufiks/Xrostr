import { setTimeout as sleep } from 'node:timers/promises';
import { createDatabase } from '@inroster/db';
import { pino } from 'pino';
import { buildHandlers } from './handlers.js';
import { OutboxRelay } from './outbox-relay.js';

const IDLE_DELAY_MS = 1000;

const logger = pino({ name: 'worker', level: process.env.LOG_LEVEL ?? 'info' });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  logger.fatal('DATABASE_URL is not set');
  process.exit(1);
}

const handle = createDatabase(databaseUrl, { max: 2 });
const relay = new OutboxRelay(handle.db, buildHandlers(logger));
const controller = new AbortController();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info({ signal }, 'shutting down');
    controller.abort();
  });
}

logger.info('outbox relay started');
while (!controller.signal.aborted) {
  try {
    const processed = await relay.tick();
    // Drain quickly while there is a backlog; otherwise poll once a second.
    if (processed === 0)
      await sleep(IDLE_DELAY_MS, undefined, { signal: controller.signal }).catch(() => {});
  } catch (error) {
    logger.error({ err: error }, 'relay tick failed');
    await sleep(IDLE_DELAY_MS * 5, undefined, { signal: controller.signal }).catch(() => {});
  }
}
await handle.close();
logger.info('stopped');
