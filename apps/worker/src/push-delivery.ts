import { isUrgentNotification, type PushPayload } from '@xrostr/contracts';
import { notifications, pushSubscriptions, TENANT_SETTING, type Database } from '@xrostr/db';
import { and, eq, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import * as webPush from 'web-push';
import type { OutboxEvent } from './outbox-relay.js';

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Sends one encrypted push message. Throws an error carrying `statusCode` on failure. */
export interface PushSender {
  send(target: PushTarget, payload: string): Promise<void>;
}

export class WebPushSender implements PushSender {
  constructor(subject: string, publicKey: string, privateKey: string) {
    webPush.setVapidDetails(subject, publicKey, privateKey);
  }

  async send(target: PushTarget, payload: string): Promise<void> {
    // A day is long enough for a phone that is switched off overnight.
    await webPush.sendNotification(target, payload, { TTL: 86_400, urgency: 'high' });
  }
}

/** The push service says this device unsubscribed or the endpoint no longer exists. */
const isGone = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'statusCode' in error &&
  (error.statusCode === 404 || error.statusCode === 410);

/**
 * Delivers a `notification.created` event to every device of the recipient. Runs in the
 * event's tenant context, so Row Level Security applies to the worker as it does to the API.
 * A failing device never blocks the others, and dead subscriptions are removed.
 */
export class PushDelivery {
  constructor(
    private readonly db: Database,
    private readonly sender: PushSender,
    private readonly logger: Logger,
  ) {}

  deliver = async (event: OutboxEvent): Promise<void> => {
    const { notificationId, userId } = event.payload as { notificationId: string; userId: string };
    if (!event.tenantId) return;

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config(${TENANT_SETTING}, ${event.tenantId}, true)`);
      const [notification] = await tx
        .select()
        .from(notifications)
        .where(eq(notifications.id, notificationId))
        .limit(1);
      if (!notification) return;

      const devices = await tx
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));
      const payload: PushPayload = {
        title: notification.title,
        body: notification.body,
        url: notification.url ?? '/',
        tag: notification.id,
        ...(isUrgentNotification(notification.kind) && { urgent: true }),
      };

      for (const device of devices) {
        try {
          await this.sender.send(
            { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
            JSON.stringify(payload),
          );
        } catch (error) {
          if (isGone(error)) {
            await tx
              .delete(pushSubscriptions)
              .where(
                and(eq(pushSubscriptions.id, device.id), eq(pushSubscriptions.userId, userId)),
              );
          } else {
            this.logger.warn({ err: error, subscriptionId: device.id }, 'push delivery failed');
          }
        }
      }
    });
  };
}
