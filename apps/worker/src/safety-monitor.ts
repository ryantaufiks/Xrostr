import { localeForRegion, WELFARE_RESPONSE_MINUTES, type Locale } from '@xrostr/contracts';
import { tenants, TENANT_SETTING, type Database, type Transaction } from '@xrostr/db';
import { eq, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { localClock, notifyUsers, usersWithPermission } from './notify.js';

/** A patrol round is reported late this long after its interval ran out. */
export const PATROL_GRACE_MINUTES = 10;
/** A round still open this long after its shift ended is closed as incomplete. */
export const ROUND_CLOSE_AFTER_MINUTES = 30;

export interface SafetyTick {
  prompted: number;
  escalated: number;
  overdue: number;
  closed: number;
}

type Prompted = { id: string; user_id: string; site: string };
type Escalated = {
  id: string;
  employee_id: string;
  location_id: string;
  shift_id: string;
  user_id: string;
  full_name: string;
  site: string;
};
type Overdue = {
  route_id: string;
  route: string;
  shift_id: string;
  employee_id: string;
  location_id: string;
  user_id: string;
  full_name: string;
  site: string;
  timezone: string;
  since: Date;
};

/**
 * Officer safety, once a minute and tenant by tenant under RLS:
 * - asks officers who are checked in at a site with welfare checks "are you OK?" every interval;
 * - raises an alert for supervisors when a check is not answered in time;
 * - raises an alert when a scheduled patrol round is overdue;
 * - closes rounds left open after their shift ended.
 * Every step claims its rows in one statement, so a second worker cannot repeat it.
 */
export class SafetyMonitor {
  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
  ) {}

  async tick(): Promise<SafetyTick> {
    const total: SafetyTick = { prompted: 0, escalated: 0, overdue: 0, closed: 0 };
    const active = await this.db
      .select({ id: tenants.id, dataRegion: tenants.dataRegion })
      .from(tenants)
      .where(eq(tenants.status, 'active'));
    for (const { id, dataRegion } of active) {
      try {
        const done = await this.checkTenant(id, localeForRegion(dataRegion));
        for (const key of Object.keys(total) as (keyof SafetyTick)[]) total[key] += done[key];
      } catch (error) {
        this.logger.error({ err: error, tenantId: id }, 'safety check failed');
      }
    }
    return total;
  }

  private checkTenant(tenantId: string, locale: Locale): Promise<SafetyTick> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config(${TENANT_SETTING}, ${tenantId}, true)`);
      const result = {
        prompted: await this.prompt(tx, tenantId, locale),
        escalated: await this.escalate(tx, tenantId, locale),
        overdue: await this.patrolOverdue(tx, tenantId, locale),
        closed: await this.closeRounds(tx),
      };
      if (result.prompted + result.escalated + result.overdue + result.closed > 0)
        this.logger.info({ tenantId, ...result }, 'safety monitor acted');
      return result;
    });
  }

  /** One check per officer per interval, counted from check-in or the previous check. */
  private async prompt(tx: Transaction, tenantId: string, locale: Locale): Promise<number> {
    const rows = (
      await tx.execute<Prompted>(sql`
        with due as (
          select s.id as shift_id, s.employee_id, s.location_id, e.user_id, l.name as site
          from shifts s
          join locations l on l.id = s.location_id
          join employees e on e.id = s.employee_id
          join attendance_events ci on ci.shift_id = s.id and ci.kind = 'check_in'
          where s.status = 'published'
            and s.starts_at <= now() and s.ends_at > now()
            and l.welfare_interval_minutes is not null
            and not exists (
              select 1 from attendance_events co where co.shift_id = s.id and co.kind = 'check_out'
            )
            -- Never stack a new question on one still waiting for an answer.
            and not exists (
              select 1 from welfare_checks w where w.shift_id = s.id and w.responded_at is null
            )
            and coalesce(
              (select max(w.prompted_at) from welfare_checks w where w.shift_id = s.id),
              ci.occurred_at
            ) + make_interval(mins => l.welfare_interval_minutes) <= now()
        ),
        inserted as (
          insert into welfare_checks (id, tenant_id, shift_id, employee_id, location_id, prompted_at, respond_by)
          select gen_random_uuid(), ${tenantId}, shift_id, employee_id, location_id, now(),
                 now() + make_interval(mins => ${WELFARE_RESPONSE_MINUTES})
          from due
          returning id, shift_id
        )
        select i.id, d.user_id, d.site from inserted i join due d on d.shift_id = i.shift_id`)
    ).rows;
    for (const row of rows) {
      await notifyUsers(tx, tenantId, locale, [row.user_id], {
        kind: 'welfare.check',
        url: '/tenant/safety',
        text: {
          en: {
            title: 'Are you OK?',
            body: `Tap to confirm you are safe at ${row.site}. Please answer within ${WELFARE_RESPONSE_MINUTES} minutes.`,
          },
          id: {
            title: 'Anda aman?',
            body: `Ketuk untuk konfirmasi Anda aman di ${row.site}. Jawab dalam ${WELFARE_RESPONSE_MINUTES} menit.`,
          },
        },
      });
    }
    return rows.length;
  }

  private async escalate(tx: Transaction, tenantId: string, locale: Locale): Promise<number> {
    const rows = (
      await tx.execute<Escalated>(sql`
        with missed as (
          update welfare_checks w set escalated_at = now()
          where w.responded_at is null and w.escalated_at is null and w.respond_by <= now()
          returning w.id, w.employee_id, w.location_id, w.shift_id
        ),
        raised as (
          insert into alerts (id, tenant_id, kind, employee_id, location_id, shift_id, welfare_check_id, dedupe_key, raised_at)
          select gen_random_uuid(), ${tenantId}, 'welfare_missed', employee_id, location_id, shift_id, id,
                 'welfare:' || id, now()
          from missed
          on conflict (tenant_id, dedupe_key) do nothing
          returning welfare_check_id
        )
        select m.id, m.employee_id, m.location_id, m.shift_id, e.user_id, e.full_name, l.name as site
        from missed m
        join raised r on r.welfare_check_id = m.id
        join employees e on e.id = m.employee_id
        join locations l on l.id = m.location_id`)
    ).rows;
    if (rows.length === 0) return 0;
    const responders = await usersWithPermission(tx, 'alerts.respond');
    for (const row of rows) {
      await notifyUsers(tx, tenantId, locale, responders, {
        kind: 'alert.welfare_missed',
        url: '/tenant/alerts',
        text: {
          en: {
            title: `${row.full_name} did not answer`,
            body: `No reply to the welfare check at ${row.site}. Call or check on them.`,
          },
          id: {
            title: `${row.full_name} tidak menjawab`,
            body: `Cek keselamatan di ${row.site} tidak dijawab. Hubungi atau periksa kondisinya.`,
          },
        },
      });
    }
    return rows.length;
  }

  /**
   * A round is due every `interval_minutes` from check-in or from the officer's last round on
   * that route during the shift. One alert per missed window, keyed by when it started.
   */
  private async patrolOverdue(tx: Transaction, tenantId: string, locale: Locale): Promise<number> {
    const rows = (
      await tx.execute<Overdue>(sql`
        with windows as (
          select r.id as route_id, r.name as route, r.interval_minutes,
                 s.id as shift_id, s.employee_id, s.location_id,
                 e.user_id, e.full_name, l.name as site, l.timezone,
                 coalesce(
                   (select max(pr.started_at) from patrol_rounds pr
                     where pr.route_id = r.id and pr.shift_id = s.id),
                   ci.occurred_at
                 ) as since
          from patrol_routes r
          join shifts s on s.location_id = r.location_id
          join locations l on l.id = r.location_id
          join employees e on e.id = s.employee_id
          join attendance_events ci on ci.shift_id = s.id and ci.kind = 'check_in'
          where r.status = 'active' and r.interval_minutes is not null
            and s.status = 'published' and s.starts_at <= now() and s.ends_at > now()
            and not exists (
              select 1 from attendance_events co where co.shift_id = s.id and co.kind = 'check_out'
            )
            -- A round in progress is not late.
            and not exists (
              select 1 from patrol_rounds pr
              where pr.route_id = r.id and pr.shift_id = s.id and pr.status = 'in_progress'
            )
        ),
        due as (
          select * from windows
          where since + make_interval(mins => interval_minutes + ${PATROL_GRACE_MINUTES}) <= now()
        ),
        raised as (
          insert into alerts (id, tenant_id, kind, employee_id, location_id, shift_id, route_id, dedupe_key, raised_at)
          select gen_random_uuid(), ${tenantId}, 'patrol_overdue', employee_id, location_id, shift_id, route_id,
                 'patrol:' || route_id || ':' || shift_id || ':' || extract(epoch from since)::bigint, now()
          from due
          on conflict (tenant_id, dedupe_key) do nothing
          returning route_id, shift_id
        )
        select d.* from due d join raised r on r.route_id = d.route_id and r.shift_id = d.shift_id`)
    ).rows;
    if (rows.length === 0) return 0;
    const responders = await usersWithPermission(tx, 'alerts.respond');
    for (const row of rows) {
      const since = localClock(new Date(row.since), row.timezone);
      await notifyUsers(tx, tenantId, locale, [row.user_id], {
        kind: 'patrol.overdue',
        url: '/tenant/patrol',
        text: {
          en: {
            title: 'Patrol round due',
            body: `${row.route} at ${row.site} is overdue. Start the round now.`,
          },
          id: {
            title: 'Waktunya patroli',
            body: `Ronde ${row.route} di ${row.site} terlambat. Mulai ronde sekarang.`,
          },
        },
      });
      await notifyUsers(tx, tenantId, locale, responders, {
        kind: 'alert.patrol_overdue',
        url: '/tenant/alerts',
        text: {
          en: {
            title: 'Patrol overdue',
            body: `${row.full_name}: ${row.route} at ${row.site}, no round since ${since}.`,
          },
          id: {
            title: 'Patroli terlambat',
            body: `${row.full_name}: ${row.route} di ${row.site}, belum ada ronde sejak ${since}.`,
          },
        },
      });
    }
    return rows.length;
  }

  private async closeRounds(tx: Transaction): Promise<number> {
    const closed = await tx.execute(sql`
      update patrol_rounds pr set status = 'incomplete', finished_at = now()
      from shifts s
      where pr.shift_id = s.id and pr.status = 'in_progress'
        and s.ends_at + make_interval(mins => ${ROUND_CLOSE_AFTER_MINUTES}) <= now()`);
    return closed.rowCount ?? 0;
  }
}
