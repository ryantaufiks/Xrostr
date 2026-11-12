import type { Logger } from 'pino';
import type { EventHandler } from './outbox-relay.js';

/**
 * Event type → handlers. Phase 0 only records deliveries; Phase 1 adds the welcome
 * email with the invite link and pushes long-running work onto BullMQ queues.
 */
export function buildHandlers(logger: Logger): Map<string, EventHandler[]> {
  return new Map<string, EventHandler[]>([
    [
      'tenant.created',
      [
        async (event) => {
          logger.info({ eventId: event.id, tenantId: event.tenantId }, 'tenant.created delivered');
        },
      ],
    ],
  ]);
}
