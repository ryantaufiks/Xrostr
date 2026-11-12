import { countVisits, localeForRegion, visitsAtRisk, type Locale } from '@xrostr/contracts';
import { tenants, TENANT_SETTING, type Database } from '@xrostr/db';
import { eq, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { localClock, notifyUsers, usersWithPermission } from './notify.js';

type Target = {
  shift_id: string;
  ends_at: Date;
  timezone: string;
  officer_user_id: string;
  officer_name: string;
  zone_name: string;
  visit_gap_minutes: number;
  location_id: string;
  site: string;
  min_visits: number;
};

type Touch = { shift_id: string; location_id: string; at: Date };

/**
 * Warns when a running roving shift can no longer meet a site's visit target in the time left
 * (one visit gap per visit still owed). Planners and the officer are told once per shift and
 * site; the claim in `visit_alerts` keeps concurrent workers from warning twice. Shifts whose
 * officer has not checked in are left to the no-show monitor.
 */
export class VisitMonitor {
  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
  ) {}

  /** Returns how many warnings were sent. */
  async tick(): Promise<number> {
    const active = await this.db
      .select({ id: tenants.id, dataRegion: tenants.dataRegion })
      .from(tenants)
      .where(eq(tenants.status, 'active'));
    let warned = 0;
    for (const { id, dataRegion } of active) {
      try {
        warned += await this.checkTenant(id, localeForRegion(dataRegion));
      } catch (error) {
        this.logger.error({ err: error, tenantId: id }, 'visit check failed');
      }
    }
    return warned;
  }

  private checkTenant(tenantId: string, locale: Locale): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config(${TENANT_SETTING}, ${tenantId}, true)`);
      const targets = (
        await tx.execute<Target>(sql`
          select s.id as shift_id, s.ends_at, s.timezone, e.user_id as officer_user_id,
            e.full_name as officer_name, z.name as zone_name, z.visit_gap_minutes,
            zl.location_id, l.name as site, zl.min_visits
          from shifts s
          join zones z on z.id = s.zone_id
          join zone_locations zl on zl.zone_id = z.id and zl.min_visits > 0
          join locations l on l.id = zl.location_id
          join employees e on e.id = s.employee_id
          where s.status = 'published'
            and s.starts_at <= now() and s.ends_at > now()
            and exists (
              select 1 from attendance_events a where a.shift_id = s.id and a.kind = 'check_in'
            )
            and not exists (
              select 1 from visit_alerts v
              where v.shift_id = s.id and v.location_id = zl.location_id
            )`)
      ).rows;
      if (targets.length === 0) return 0;

      const ids = sql.join(
        [...new Set(targets.map((t) => t.shift_id))].map((id) => sql`${id}::uuid`),
        sql`, `,
      );
      const touches = (
        await tx.execute<Touch>(sql`
          select shift_id, location_id, occurred_at as at from attendance_events
            where shift_id in (${ids})
          union all
          select shift_id, location_id, occurred_at from site_visits where shift_id in (${ids})
          union all
          select pr.shift_id, rt.location_id, ps.scanned_at
            from patrol_scans ps
            join patrol_rounds pr on pr.id = ps.round_id
            join patrol_routes rt on rt.id = pr.route_id
            where pr.shift_id in (${ids})`)
      ).rows;

      const now = Date.now();
      let planners: string[] | null = null;
      let warned = 0;
      for (const t of targets) {
        const times = touches
          .filter((x) => x.shift_id === t.shift_id && x.location_id === t.location_id)
          .map((x) => new Date(x.at));
        const visits = countVisits(times, t.visit_gap_minutes);
        const owed = t.min_visits - visits;
        const endsAt = new Date(t.ends_at);
        if (!visitsAtRisk(owed, endsAt.getTime() - now, t.visit_gap_minutes)) continue;

        const claimed = (
          await tx.execute(sql`
            insert into visit_alerts (tenant_id, shift_id, location_id)
            values (${tenantId}, ${t.shift_id}, ${t.location_id})
            on conflict do nothing
            returning shift_id`)
        ).rows;
        if (claimed.length === 0) continue;

        planners ??= await usersWithPermission(tx, 'schedules.manage');
        const end = localClock(endsAt, t.timezone);
        await notifyUsers(tx, tenantId, locale, planners, {
          kind: 'visits.behind',
          url: '/tenant/roving',
          text: {
            en: {
              title: 'Roving visits behind',
              body: `${t.officer_name} (${t.zone_name}): ${visits} of ${t.min_visits} visits at ${t.site}, shift ends ${end}.`,
            },
            id: {
              title: 'Kunjungan roving tertinggal',
              body: `${t.officer_name} (${t.zone_name}): ${visits} dari ${t.min_visits} kunjungan di ${t.site}, shift berakhir ${end.replace(':', '.')}.`,
            },
          },
        });
        await notifyUsers(tx, tenantId, locale, [t.officer_user_id], {
          kind: 'visits.reminder',
          url: '/tenant',
          text: {
            en: {
              title: `Visit ${t.site}`,
              body: `${t.site} still needs ${owed} visit${owed === 1 ? '' : 's'} before ${end}. Scan its QR code when you arrive.`,
            },
            id: {
              title: `Kunjungi ${t.site}`,
              body: `${t.site} masih butuh ${owed} kunjungan sebelum ${end.replace(':', '.')}. Pindai QR di lokasi saat tiba.`,
            },
          },
        });
        warned++;
      }
      if (warned > 0) this.logger.info({ tenantId, warned }, 'visit warnings sent');
      return warned;
    });
  }
}
