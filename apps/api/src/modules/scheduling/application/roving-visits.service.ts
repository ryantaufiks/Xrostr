import { Injectable } from '@nestjs/common';
import {
  countVisits,
  visitsAtRisk,
  type RovingShiftVisits,
  type VisitState,
} from '@xrostr/contracts';
import { Clock, UnitOfWork } from '../../../shared/application/ports.js';
import { addDays, localToUtc, utcToLocal } from '../../../shared/domain/local-time.js';
import type { Principal } from '../../identity/public-api.js';
import { WorkforceDirectory } from '../../workforce/public-api.js';
import {
  AttendanceRepository,
  VisitRepository,
  ZoneRepository,
  type RovingShift,
} from './ports.js';

const tenantOf = (actor: Principal) => actor.subject.tenantId!;

/**
 * Supervisor view of roving shifts on one local date: per site of the zone, how many visits the
 * officer made against the target, and whether the zone went unserved after a relief call.
 */
@Injectable()
export class RovingVisitsService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly visits: VisitRepository,
    private readonly zones: ZoneRepository,
    private readonly attendance: AttendanceRepository,
    private readonly workforce: WorkforceDirectory,
    private readonly clock: Clock,
  ) {}

  forDate(actor: Principal, date: string): Promise<RovingShiftVisits[]> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const now = this.clock.now();
      // Wide enough for every time zone; each shift is then matched on its own local date.
      const candidates = await this.visits.rovingShifts(
        localToUtc(addDays(date, -1), '00:00', 'UTC'),
        localToUtc(addDays(date, 2), '00:00', 'UTC'),
      );
      const shifts = candidates.filter((s) => utcToLocal(s.startsAt, s.timezone).date === date);
      if (shifts.length === 0) return [];

      const ids = shifts.map((s) => s.id);
      // One transaction, one connection: the reads run one after another.
      const zones = await this.zones.list();
      const touches = await this.visits.touches(ids);
      const records = await this.attendance.forShifts(ids);
      const people = await this.workforce.employeesById([
        ...new Set(shifts.map((s) => s.employeeId)),
      ]);
      const pulledSites = await this.workforce.locationsById(
        shifts.flatMap((s) => (s.pulledTo ? [s.pulledTo.locationId] : [])),
      );
      const zoneById = new Map(zones.map((z) => [z.id, z]));

      return shifts.flatMap((shift): RovingShiftVisits[] => {
        const zone = zoneById.get(shift.zoneId);
        if (!zone) return [];
        const phase = now < shift.startsAt ? 'upcoming' : now < shift.endsAt ? 'running' : 'ended';
        const unservedSince = unservedFrom(shift);
        const pulledSite = shift.pulledTo && pulledSites.get(shift.pulledTo.locationId);
        const start = utcToLocal(shift.startsAt, shift.timezone);
        return [
          {
            shiftId: shift.id,
            employee: {
              id: shift.employeeId,
              fullName: people.get(shift.employeeId)?.fullName ?? '',
            },
            zone: { id: zone.id, name: zone.name },
            timezone: shift.timezone,
            localDate: start.date,
            localStart: start.time,
            localEnd: utcToLocal(shift.endsAt, shift.timezone).time,
            phase,
            checkedInAt: records.get(shift.id)?.checkInAt ?? null,
            unservedSince: unservedSince?.toISOString() ?? null,
            pulledTo: pulledSite ? { id: pulledSite.id, name: pulledSite.name } : null,
            visitGapMinutes: zone.visitGapMinutes,
            sites: zone.locations.map((site) => {
              const times = touches
                .filter((t) => t.shiftId === shift.id && t.locationId === site.id)
                .map((t) => t.at);
              const visits = countVisits(times, zone.visitGapMinutes);
              const last = times.length > 0 ? Math.max(...times.map((t) => t.getTime())) : null;
              return {
                location: { id: site.id, name: site.name },
                minVisits: site.minVisits,
                visits,
                lastVisitAt: last == null ? null : new Date(last).toISOString(),
                state: stateOf(
                  site.minVisits,
                  visits,
                  phase,
                  shift,
                  now,
                  zone.visitGapMinutes,
                  unservedSince,
                ),
              };
            }),
          },
        ];
      });
    });
  }
}

/** When the zone lost its officer to a relief: the cut-off, or the start if they never began. */
function unservedFrom(shift: RovingShift): Date | null {
  if (!shift.pulledTo) return null;
  return shift.status === 'cancelled' ? shift.startsAt : shift.endsAt;
}

function stateOf(
  minVisits: number,
  visits: number,
  phase: RovingShiftVisits['phase'],
  shift: RovingShift,
  now: Date,
  gapMinutes: number,
  unservedSince: Date | null,
): VisitState {
  if (minVisits === 0) return 'none';
  if (visits >= minVisits) return 'met';
  if (unservedSince) return 'unserved';
  if (phase === 'ended') return 'missed';
  if (
    phase === 'running' &&
    visitsAtRisk(minVisits - visits, shift.endsAt.getTime() - now.getTime(), gapMinutes)
  )
    return 'behind';
  return 'pending';
}
