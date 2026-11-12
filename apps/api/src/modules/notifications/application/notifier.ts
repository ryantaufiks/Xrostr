import { Injectable } from '@nestjs/common';
import type { Localized } from '@xrostr/contracts';
import { EventPublisher, UnitOfWork } from '../../../shared/application/ports.js';
import { LocalePreferences } from '../../identity/public-api.js';
import { NotificationRepository } from './ports.js';

export interface NotificationMessage {
  userId: string;
  kind: string;
  url: string | null;
  /** Written in every language; the recipient's language is stored and pushed. */
  text: Localized<{ title: string; body: string }>;
}

export const NOTIFICATION_CREATED = 'notification.created';

/**
 * Public API of the notifications module. Stores the notification in the user's inbox and
 * queues delivery to their devices in the same transaction; the worker sends the push.
 */
@Injectable()
export class Notifier {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly notifications: NotificationRepository,
    private readonly events: EventPublisher,
    private readonly locales: LocalePreferences,
  ) {}

  notify(tenantId: string, message: NotificationMessage): Promise<string> {
    return this.uow.runInTenant(tenantId, async () => {
      const { text, ...rest } = message;
      const locale = await this.locales.ofUser(tenantId, message.userId);
      const notification = { ...rest, ...text[locale] };
      const notificationId = await this.notifications.insert(notification);
      await this.events.publish({
        type: NOTIFICATION_CREATED,
        tenantId,
        payload: { notificationId, userId: notification.userId },
      });
      return notificationId;
    });
  }
}
