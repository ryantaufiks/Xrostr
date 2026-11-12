import { localeForRegion, type Locale } from '@xrostr/contracts';
import { employees, tenants, TENANT_SETTING, type Database } from '@xrostr/db';
import { eq, inArray, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { localClock, notifyUsers, usersWithPermission } from './notify.js';

/** Minutes after a shift starts before its missing check-in is reported. */
export const NO_SHOW_GRACE_MINUTES = 15;

type DueShift = {
  id: string;
  employee_id: string;
  starts_at: Date;
  /** The site's name, or the zone's for a roving shift. */
  place: string;
  timezone: string;
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
            -- On-call at home is never checked in.
            and s.kind <> 'standby'
            and not exists (
              select 1 from attendance_events a where a.shift_id = s.id and a.kind = 'check_in'
            )
          -- A roving shift has no site: name its zone and read the time in the shift's zone.
          returning s.id, s.employee_id, s.starts_at,
            coalesce(
              (select l.name from locations l where l.id = s.location_id),
              (select z.name from zones z where z.id = s.zone_id),
              ''
            ) as place,
            coalesce((select l.timezone from locations l where l.id = s.location_id), s.timezone)
              as timezone`)
      ).rows;
      if (due.length === 0) return 0;

      const planners = await usersWithPermission(tx, 'schedules.manage');
      const people = await tx
        .select({ id: employees.id, userId: employees.userId, fullName: employees.fullName })
        .from(employees)
        .where(inArray(employees.id, [...new Set(due.map((d) => d.employee_id))]));

      for (const shift of due) {
        const person = people.find((p) => p.id === shift.employee_id);
        if (!person) continue;
        const start = localClock(new Date(shift.starts_at), shift.timezone);

        await notifyUsers(tx, tenantId, tenantLocale, planners, {
          kind: 'attendance.no_show',
          url: '/tenant/roster',
          text: {
            en: {
              title: 'Officer has not checked in',
              body: `${person.fullName}, ${start} shift at ${shift.place}, has not checked in.`,
            },
            id: {
              title: 'Officer belum absen',
              body: `${person.fullName}, shift ${start} di ${shift.place}, belum absen masuk.`,
            },
          },
        });
        await notifyUsers(tx, tenantId, tenantLocale, [person.userId], {
          kind: 'attendance.reminder',
          url: '/tenant',
          text: {
            en: {
              title: 'You have not checked in',
              body: `Your ${start} shift at ${shift.place} has started. Scan the QR code on site to check in.`,
            },
            id: {
              title: 'Anda belum absen masuk',
              body: `Shift ${start} di ${shift.place} sudah dimulai. Pindai QR di lokasi untuk absen.`,
            },
          },
        });
      }
      this.logger.info({ tenantId, shifts: due.length }, 'no-show alerts sent');
      return due.length;
    });
  }
}
