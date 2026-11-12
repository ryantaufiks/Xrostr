import { setTimeout as sleep } from 'node:timers/promises';
import { createDatabase } from '@xrostr/db';
import { pino } from 'pino';
import { buildHandlers } from './handlers.js';
import { NoShowMonitor } from './no-show-monitor.js';
import { OutboxRelay } from './outbox-relay.js';
import { ReliefMonitor } from './relief-monitor.js';
import { SafetyMonitor } from './safety-monitor.js';
import { WebPushSender } from './push-delivery.js';

const IDLE_DELAY_MS = 1000;
const MONITOR_INTERVAL_MS = 60_000;

const logger = pino({ name: 'worker', level: process.env.LOG_LEVEL ?? 'info' });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  logger.fatal('DATABASE_URL is not set');
  process.exit(1);
}

// One connection for the relay's batch transaction, the rest for handlers.
const handle = createDatabase(databaseUrl, { max: 4 });
const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
const sender =
  VAPID_SUBJECT && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY
    ? new WebPushSender(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    : null;
const relay = new OutboxRelay(handle.db, buildHandlers(handle.db, sender, logger));
const controller = new AbortController();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info({ signal }, 'shutting down');
    controller.abort();
  });
}

// Missed check-ins, welfare checks, late patrols and unanswered relief offers are looked at
// once a minute, beside the relay loop. A tick still running when the next is due is skipped,
// never doubled.
const monitors = [
  new NoShowMonitor(handle.db, logger),
  new SafetyMonitor(handle.db, logger),
  new ReliefMonitor(handle.db, logger),
];
let monitoring = false;
const monitorTimer = setInterval(() => {
  if (monitoring) return;
  monitoring = true;
  (async () => {
    for (const monitor of monitors) {
      await monitor
        .tick()
        .catch((error: unknown) =>
          logger.error({ err: error }, `${monitor.constructor.name} failed`),
        );
    }
  })().finally(() => (monitoring = false));
}, MONITOR_INTERVAL_MS);
controller.signal.addEventListener('abort', () => clearInterval(monitorTimer));

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
