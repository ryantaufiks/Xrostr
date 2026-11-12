import { Injectable } from '@nestjs/common';
import type { ShiftKind, ShiftStatus } from '@xrostr/contracts';
import { siteVisits } from '@xrostr/db';
import { sql } from 'drizzle-orm';
import { DatabaseContext } from '../../../shared/infrastructure/database/database-context.js';
import {
  VisitRepository,
  type NewSiteVisit,
  type RovingShift,
  type SiteTouch,
} from '../application/ports.js';

type RovingRow = {
  id: string;
  zone_id: string;
  employee_id: string;
  kind: ShiftKind;
  status: ShiftStatus;
  starts_at: Date;
  ends_at: Date;
  timezone: string;
  notes: string | null;
  pulled_request_id: string | null;
  pulled_location_id: string | null;
};

@Injectable()
export class DrizzleVisitRepository extends VisitRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async insert(visit: NewSiteVisit): Promise<void> {
    await this.ctx
      .executor()
      .insert(siteVisits)
      .values({ ...visit, tenantId: this.ctx.tenantId() });
  }

  async rovingShifts(start: Date, end: Date): Promise<RovingShift[]> {
    const rows = (
      await this.ctx.executor().execute<RovingRow>(sql`
        select s.id, s.zone_id, s.employee_id, s.kind, s.status, s.starts_at, s.ends_at,
          s.timezone, s.notes, r.id as pulled_request_id, r.location_id as pulled_location_id
        from shifts s
        left join lateral (
          select r.id, r.location_id from relief_requests r
          where r.pulled_shift_id = s.id and r.status = 'filled'
          order by r.closed_at desc limit 1
        ) r on true
        where s.zone_id is not null
          and s.starts_at < ${end.toISOString()} and s.ends_at > ${start.toISOString()}
          and (s.status = 'published' or (s.status = 'cancelled' and r.id is not null))
        order by s.starts_at`)
    ).rows;
    return rows.map((r) => ({
      id: r.id,
      locationId: null,
      zoneId: r.zone_id,
      employeeId: r.employee_id,
      kind: r.kind,
      status: r.status,
      startsAt: new Date(r.starts_at),
      endsAt: new Date(r.ends_at),
      timezone: r.timezone,
      notes: r.notes,
      pulledTo:
        r.pulled_request_id && r.pulled_location_id
          ? { requestId: r.pulled_request_id, locationId: r.pulled_location_id }
          : null,
    }));
  }

  async touches(shiftIds: readonly string[]): Promise<SiteTouch[]> {
    if (shiftIds.length === 0) return [];
    const ids = sql.join(
      shiftIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const rows = (
      await this.ctx.executor().execute<{ shift_id: string; location_id: string; at: Date }>(sql`
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
    return rows.map((r) => ({
      shiftId: r.shift_id,
      locationId: r.location_id,
      at: new Date(r.at),
    }));
  }
}
