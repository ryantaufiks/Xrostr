import { Injectable } from '@nestjs/common';
import type { NotificationInbox, PushSubscriptionRequest } from '@xrostr/contracts';
import { Clock, UnitOfWork } from '../../../shared/application/ports.js';
import { Notifier } from './notifier.js';
import { NotificationRepository, PushSubscriptionRepository } from './ports.js';

const INBOX_SIZE = 30;

/** The caller of every use case here: a signed-in tenant user. */
export interface Recipient {
  tenantId: string;
  userId: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly notifications: NotificationRepository,
    private readonly subscriptions: PushSubscriptionRepository,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
  ) {}

  inbox(me: Recipient): Promise<NotificationInbox> {
    return this.uow.runInTenant(me.tenantId, async () => ({
      unread: await this.notifications.countUnread(me.userId),
      items: await this.notifications.latestForUser(me.userId, INBOX_SIZE),
    }));
  }

  markRead(me: Recipient, notificationId: string): Promise<void> {
    return this.uow.runInTenant(me.tenantId, () =>
      this.notifications.markRead(me.userId, notificationId, this.clock.now()),
    );
  }

  markAllRead(me: Recipient): Promise<void> {
    return this.uow.runInTenant(me.tenantId, () =>
      this.notifications.markAllRead(me.userId, this.clock.now()),
    );
  }

  subscribe(
    me: Recipient,
    subscription: PushSubscriptionRequest,
    userAgent: string | null,
  ): Promise<void> {
    return this.uow.runInTenant(me.tenantId, () =>
      this.subscriptions.save(me.userId, subscription, userAgent),
    );
  }

  unsubscribe(me: Recipient, endpoint: string): Promise<void> {
    return this.uow.runInTenant(me.tenantId, () => this.subscriptions.remove(me.userId, endpoint));
  }

  /** Lets a user check that notifications reach this device. */
  async sendTest(me: Recipient): Promise<void> {
    await this.notifier.notify(me.tenantId, {
      userId: me.userId,
      kind: 'test',
      title: 'Notifikasi aktif',
      body: 'Perangkat ini akan menerima pemberitahuan dari Xrostr.',
      url: '/tenant/notifications',
    });
  }
}
