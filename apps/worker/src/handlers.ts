import type { Database } from '@xrostr/db';
import type { Logger } from 'pino';
import type { EventHandler } from './outbox-relay.js';
import { PushDelivery, type PushSender } from './push-delivery.js';

/**
 * Event type → handlers. `sender` is null when Web Push is not configured; notifications
 * then stay in the in-app inbox only.
 */
export function buildHandlers(
  db: Database,
  sender: PushSender | null,
  logger: Logger,
): Map<string, EventHandler[]> {
  const handlers = new Map<string, EventHandler[]>([
    [
      'tenant.created',
      [
        async (event) => {
          logger.info({ eventId: event.id, tenantId: event.tenantId }, 'tenant.created delivered');
        },
      ],
    ],
  ]);
  if (sender) {
    handlers.set('notification.created', [new PushDelivery(db, sender, logger).deliver]);
  } else {
    logger.warn('VAPID keys not set: push notifications are disabled');
  }
  return handlers;
}
