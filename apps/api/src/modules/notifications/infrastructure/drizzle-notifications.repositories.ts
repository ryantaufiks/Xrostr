import { Injectable } from '@nestjs/common';
import type { NotificationView, PushSubscriptionRequest } from '@xrostr/contracts';
import { notifications, pushSubscriptions } from '@xrostr/db';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { DatabaseContext } from '../../../shared/infrastructure/database/database-context.js';
import {
  NotificationRepository,
  PushSubscriptionRepository,
  type NewNotification,
} from '../application/ports.js';

@Injectable()
export class DrizzleNotificationRepository extends NotificationRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async insert(n: NewNotification): Promise<string> {
    const [row] = await this.ctx
      .executor()
      .insert(notifications)
      .values({ ...n, tenantId: this.ctx.tenantId() })
      .returning({ id: notifications.id });
    return row!.id;
  }

  async latestForUser(userId: string, limit: number): Promise<NotificationView[]> {
    const rows = await this.ctx
      .executor()
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      url: r.url,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async countUnread(userId: string): Promise<number> {
    const [row] = await this.ctx
      .executor()
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return row?.value ?? 0;
  }

  async markRead(userId: string, notificationId: string, at: Date): Promise<void> {
    await this.ctx
      .executor()
      .update(notifications)
      .set({ readAt: at })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
        ),
      );
  }

  async markAllRead(userId: string, at: Date): Promise<void> {
    await this.ctx
      .executor()
      .update(notifications)
      .set({ readAt: at })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  }
}

@Injectable()
export class DrizzlePushSubscriptionRepository extends PushSubscriptionRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async save(
    userId: string,
    subscription: PushSubscriptionRequest,
    userAgent: string | null,
  ): Promise<void> {
    const values = {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent,
    };
    await this.ctx
      .executor()
      .insert(pushSubscriptions)
      .values({ ...values, tenantId: this.ctx.tenantId(), userId, endpoint: subscription.endpoint })
      .onConflictDoUpdate({
        target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
        set: values,
      });
  }

  async remove(userId: string, endpoint: string): Promise<void> {
    await this.ctx
      .executor()
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  }
}
