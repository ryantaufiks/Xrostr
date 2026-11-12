import { notifications, outboxEvents, roles, userRoles, users, type Transaction } from '@xrostr/db';
import { isLocale, type Locale, type Localized } from '@xrostr/contracts';
import { and, eq, inArray, sql } from 'drizzle-orm';

export interface WorkerMessage {
  kind: string;
  url: string;
  text: Localized<{ title: string; body: string }>;
}

/**
 * Writes inbox notifications and `notification.created` outbox events, exactly as the API's
 * Notifier does, each in the recipient's own language or else the tenant's default.
 * Requires the tenant's RLS context on `tx`.
 */
export async function notifyUsers(
  tx: Transaction,
  tenantId: string,
  tenantLocale: Locale,
  userIds: readonly string[],
  message: WorkerMessage,
): Promise<void> {
  if (userIds.length === 0) return;
  const locales = new Map(
    (
      await tx
        .select({ id: users.id, locale: users.locale })
        .from(users)
        .where(inArray(users.id, [...userIds]))
    ).map((u) => [u.id, u.locale]),
  );
  for (const userId of new Set(userIds)) {
    const preferred = locales.get(userId);
    const { title, body } = message.text[isLocale(preferred) ? preferred : tenantLocale];
    const [row] = await tx
      .insert(notifications)
      .values({ tenantId, userId, kind: message.kind, url: message.url, title, body })
      .returning({ id: notifications.id });
    await tx.insert(outboxEvents).values({
      tenantId,
      type: 'notification.created',
      payload: { notificationId: row!.id, userId },
    });
  }
}

/** Active users whose role grants the permission. Requires the tenant's RLS context. */
export async function usersWithPermission(tx: Transaction, permission: string): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(users.status, 'active'), sql`${permission} = any(${roles.permissions})`));
  return rows.map((r) => r.id);
}

/** "20:00" in a time zone. */
export function localClock(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
}
