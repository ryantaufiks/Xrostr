import { Injectable } from '@nestjs/common';
import { EventPublisher, UnitOfWork } from '../../../shared/application/ports.js';
import { NotificationRepository, type NewNotification } from './ports.js';

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
  ) {}

  notify(tenantId: string, notification: NewNotification): Promise<string> {
    return this.uow.runInTenant(tenantId, async () => {
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
