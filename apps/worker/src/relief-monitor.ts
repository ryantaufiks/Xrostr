import { localeForRegion, type Locale } from '@xrostr/contracts';
import { tenants, TENANT_SETTING, type Database } from '@xrostr/db';
import { eq, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { localClock, notifyUsers } from './notify.js';

type Advanced = {
  request_id: string;
  requested_by: string;
  timeout_minutes: number;
  starts_at: Date;
  ends_at: Date;
  site: string;
  timezone: string;
  next_user_id: string | null;
};

const dateIn = (instant: Date, timeZone: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(instant);

/**
 * Moves relief searches along when an officer does not answer in time: the expired offer is
 * closed and the next candidate is offered, or the search ends as unfilled and the planner who
 * started it is told. Runs once a minute, tenant by tenant under RLS. Requests are locked with
 * SKIP LOCKED, so an officer accepting at the same moment wins cleanly.
 */
export class ReliefMonitor {
  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
  ) {}

  /** Returns how many expired offers were moved on. */
  async tick(): Promise<number> {
    const active = await this.db
      .select({ id: tenants.id, dataRegion: tenants.dataRegion })
      .from(tenants)
      .where(eq(tenants.status, 'active'));
    let moved = 0;
    for (const { id, dataRegion } of active) {
      try {
        moved += await this.checkTenant(id, localeForRegion(dataRegion));
      } catch (error) {
        this.logger.error({ err: error, tenantId: id }, 'relief check failed');
      }
    }
    return moved;
  }

  private checkTenant(tenantId: string, locale: Locale): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config(${TENANT_SETTING}, ${tenantId}, true)`);
      const rows = (
        await tx.execute<Advanced>(sql`
          with due as (
            select r.id from relief_requests r
            where r.status = 'open'
              and exists (
                select 1 from relief_offers o
                where o.request_id = r.id and o.status = 'offered' and o.expires_at <= now()
              )
            for update skip locked
          ),
          expired as (
            update relief_offers o set status = 'expired', responded_at = now()
            from due where o.request_id = due.id and o.status = 'offered' and o.expires_at <= now()
            returning o.request_id
          ),
          next as (
            update relief_offers o
            set status = 'offered', offered_at = now(),
                expires_at = now() + make_interval(mins => r.timeout_minutes)
            from relief_requests r
            where r.id = o.request_id and o.id in (
              select distinct on (q.request_id) q.id from relief_offers q
              where q.request_id in (select request_id from expired) and q.status = 'queued'
              order by q.request_id, q.position
            )
            returning o.request_id, o.employee_id
          ),
          unfilled as (
            update relief_requests r set status = 'unfilled', closed_at = now()
            where r.id in (select request_id from expired)
              and r.id not in (select request_id from next)
            returning r.id
          )
          select r.id as request_id, r.requested_by, r.timeout_minutes, r.starts_at, r.ends_at,
                 l.name as site, l.timezone, e.user_id as next_user_id
          from relief_requests r
          join locations l on l.id = r.location_id
          left join next n on n.request_id = r.id
          left join employees e on e.id = n.employee_id
          where r.id in (select distinct request_id from expired)`)
      ).rows;

      for (const row of rows) {
        const start = new Date(row.starts_at);
        const end = new Date(row.ends_at);
        const clock = (d: Date) => localClock(d, row.timezone);
        const when = {
          en: `${dateIn(start, row.timezone, 'en-SG')} ${clock(start)}–${clock(end)}`,
          id: `${dateIn(start, row.timezone, 'id-ID')} ${clock(start).replace(':', '.')}–${clock(end).replace(':', '.')}`,
        };
        if (row.next_user_id) {
          await notifyUsers(tx, tenantId, locale, [row.next_user_id], {
            kind: 'relief.offered',
            url: '/tenant/relief',
            text: {
              en: {
                title: 'Replacement shift offered',
                body: `${row.site}, ${when.en}. Please answer within ${row.timeout_minutes} minutes.`,
              },
              id: {
                title: 'Tawaran shift pengganti',
                body: `${row.site}, ${when.id}. Jawab dalam ${row.timeout_minutes} menit.`,
              },
            },
          });
        } else {
          await notifyUsers(tx, tenantId, locale, [row.requested_by], {
            kind: 'relief.unfilled',
            url: '/tenant/roster',
            text: {
              en: {
                title: 'No relief found',
                body: `Nobody took the shift at ${row.site}, ${when.en}. Find someone else or call around.`,
              },
              id: {
                title: 'Pengganti tidak didapat',
                body: `Tidak ada yang menerima shift di ${row.site}, ${when.id}. Cari officer lain atau hubungi langsung.`,
              },
            },
          });
        }
      }
      if (rows.length > 0)
        this.logger.info({ tenantId, moved: rows.length }, 'relief offers moved on');
      return rows.length;
    });
  }
}
