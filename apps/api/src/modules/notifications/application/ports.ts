import type { NotificationView, PushSubscriptionRequest } from '@xrostr/contracts';

export interface NewNotification {
  userId: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
}

/** All methods require a tenant unit of work. */
export abstract class NotificationRepository {
  abstract insert(notification: NewNotification): Promise<string>;
  abstract latestForUser(userId: string, limit: number): Promise<NotificationView[]>;
  abstract countUnread(userId: string): Promise<number>;
  abstract markRead(userId: string, notificationId: string, at: Date): Promise<void>;
  abstract markAllRead(userId: string, at: Date): Promise<void>;
}

/** All methods require a tenant unit of work. */
export abstract class PushSubscriptionRepository {
  abstract save(
    userId: string,
    subscription: PushSubscriptionRequest,
    userAgent: string | null,
  ): Promise<void>;
  abstract remove(userId: string, endpoint: string): Promise<void>;
}

export abstract class PushSettings {
  /** Null when Web Push is not configured; the app then works without device notifications. */
  abstract readonly vapidPublicKey: string | null;
}
