import {
  employees,
  locations,
  notifications,
  outboxEvents,
  roles,
  tenants,
  TENANT_SETTING,
  userRoles,
  users,
  type Database,
  type Transaction,
} from '@xrostr/db';
import { isLocale, localeForRegion, type Locale, type Localized } from '@xrostr/contracts';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Logger } from 'pino';

/** Minutes after a shift starts before its missing check-in is reported. */
export const NO_SHOW_GRACE_MINUTES = 15;

type DueShift = {
  id: string;
  employee_id: string;
  location_id: string;
  starts_at: Date;
};

/**
 * Finds published shifts that started at least 15 minutes ago, are still running and have no
 * check-in, then tells the planners (everyone who may manage schedules) and the officer.
 * Each shift is reported once. Runs tenant by tenant under that tenant's RLS context.
 *
 * The worker has no HTTP API to call, so it writes inbox rows and `notification.created`
 * outbox events itself, exactly as the API's Notifier does; push delivery follows as usual.
 */
export class NoShowMonitor {
  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
  ) {}

  /** Returns how many shifts were reported. */
  async tick(): Promise<number> {
    const active = await this.db
      .select({ id: tenants.id, dataRegion: tenants.dataRegion })
      .from(tenants)
      .where(eq(tenants.status, 'active'));
    let reported = 0;
    for (const { id, dataRegion } of active) {
      try {
        reported += await this.checkTenant(id, localeForRegion(dataRegion));
      } catch (error) {
        this.logger.error({ err: error, tenantId: id }, 'no-show check failed');
      }
    }
    return reported;
  }

  private checkTenant(tenantId: string, tenantLocale: Locale): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config(${TENANT_SETTING}, ${tenantId}, true)`);
      // Claiming the rows in the same statement makes concurrent workers report each shift once.
      const due = (
        await tx.execute<DueShift>(sql`
          update shifts s set no_show_alerted_at = now()
          where s.status = 'published'
            and s.no_show_alerted_at is null
            and s.starts_at <= now() - make_interval(mins => ${NO_SHOW_GRACE_MINUTES})
            and s.ends_at > now()
            and not exists (
              select 1 from attendance_events a where a.shift_id = s.id and a.kind = 'check_in'
            )
          returning s.id, s.employee_id, s.location_id, s.starts_at`)
      ).rows;
      if (due.length === 0) return 0;

      const planners = await plannerUserIds(tx);
      const people = await tx
        .select({ id: employees.id, userId: employees.userId, fullName: employees.fullName })
        .from(employees)
        .where(inArray(employees.id, [...new Set(due.map((d) => d.employee_id))]));
      const recipients = [...planners, ...people.map((p) => p.userId)];
      const locales = new Map(
        (
          await tx
            .select({ id: users.id, locale: users.locale })
            .from(users)
            .where(inArray(users.id, recipients))
        ).map((u) => [u.id, u.locale]),
      );
      const sites = await tx
        .select({ id: locations.id, name: locations.name, timezone: locations.timezone })
        .from(locations)
        .where(inArray(locations.id, [...new Set(due.map((d) => d.location_id))]));

      for (const shift of due) {
        const person = people.find((p) => p.id === shift.employee_id);
        const site = sites.find((s) => s.id === shift.location_id);
        if (!person || !site) continue;
        const start = localClock(new Date(shift.starts_at), site.timezone);

        for (const userId of planners) {
          await notify(tx, tenantId, userId, locales, tenantLocale, {
            kind: 'attendance.no_show',
            url: '/tenant/roster',
            text: {
              en: {
                title: 'Officer has not checked in',
                body: `${person.fullName}, ${start} shift at ${site.name}, has not checked in.`,
              },
              id: {
                title: 'Officer belum absen',
                body: `${person.fullName}, shift ${start} di ${site.name}, belum absen masuk.`,
              },
            },
          });
        }
        await notify(tx, tenantId, person.userId, locales, tenantLocale, {
          kind: 'attendance.reminder',
          url: '/tenant',
          text: {
            en: {
              title: 'You have not checked in',
              body: `Your ${start} shift at ${site.name} has started. Scan the QR code on site to check in.`,
            },
            id: {
              title: 'Anda belum absen masuk',
              body: `Shift ${start} di ${site.name} sudah dimulai. Pindai QR di lokasi untuk absen.`,
            },
          },
        });
      }
      this.logger.info({ tenantId, shifts: due.length }, 'no-show alerts sent');
      return due.length;
    });
  }
}

async function plannerUserIds(tx: Transaction): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(users.status, 'active'), sql`'schedules.manage' = any(${roles.permissions})`));
  return rows.map((r) => r.id);
}

/** Written in the recipient's own language, else the tenant's default, as the API's Notifier. */
async function notify(
  tx: Transaction,
  tenantId: string,
  userId: string,
  locales: ReadonlyMap<string, string | null>,
  tenantLocale: Locale,
  message: { kind: string; url: string; text: Localized<{ title: string; body: string }> },
): Promise<void> {
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

/** "20:00" in the site's time zone. */
function localClock(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
}
