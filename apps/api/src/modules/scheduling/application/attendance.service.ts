import { timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AttendanceResult, RecordAttendanceRequest } from '@xrostr/contracts';
import { Clock, UnitOfWork } from '../../../shared/application/ports.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import type { Principal } from '../../identity/public-api.js';
import { WorkforceDirectory } from '../../workforce/public-api.js';
import { distanceMeters, withinGeofence } from '../../../shared/domain/geo.js';
import { utcToLocal } from '../../../shared/domain/local-time.js';
import { SchedulingErrors } from '../domain/scheduling-errors.js';
import { AttendanceRepository, ShiftRepository, type Shift } from './ports.js';

const HOUR = 3_600_000;
/** Check-in opens this long before the shift starts. */
export const CHECKIN_OPENS_BEFORE_MS = 2 * HOUR;
/** Check-out stays possible this long after the shift ends. */
export const CHECKOUT_CLOSES_AFTER_MS = 4 * HOUR;

const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Check-in and check-out by scanning the site's QR code. Valid only with the site's current
 * code, a GPS position inside the geofence, and a published shift whose window is open.
 * The first scan of a shift checks in; the next one checks out.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly shifts: ShiftRepository,
    private readonly attendance: AttendanceRepository,
    private readonly workforce: WorkforceDirectory,
    private readonly clock: Clock,
  ) {}

  record(actor: Principal, input: RecordAttendanceRequest): Promise<Result<AttendanceResult>> {
    return this.uow.runInTenant(actor.subject.tenantId!, async () => {
      const now = this.clock.now();
      const me = await this.workforce.employeeOfUser(actor.subject.id);
      if (!me || me.status !== 'active') return err(SchedulingErrors.notAnEmployee());
      const site = await this.workforce.location(input.locationId);
      if (!site || !sameSecret(site.checkinSecret, input.code))
        return err(SchedulingErrors.invalidCheckinCode());
      if (site.latitude == null || site.longitude == null)
        return err(SchedulingErrors.siteWithoutPoint());

      const distanceM = Math.round(
        distanceMeters(input, { latitude: site.latitude, longitude: site.longitude }),
      );
      if (!withinGeofence(distanceM, site.geofenceRadiusM, input.accuracy)) {
        return err(SchedulingErrors.outsideGeofence(distanceM, site.geofenceRadiusM));
      }

      const candidates = await this.shifts.attendanceCandidates(
        me.id,
        site.id,
        now,
        CHECKIN_OPENS_BEFORE_MS,
        CHECKOUT_CLOSES_AFTER_MS,
      );
      const records = await this.attendance.forShifts(candidates.map((s) => s.id));
      // An open check-in wins: the scan ends that shift. Otherwise start the next one.
      const open = candidates.find(
        (s) => records.get(s.id)?.checkInAt && !records.get(s.id)?.checkOutAt,
      );
      const startable = candidates.find((s) => !records.get(s.id)?.checkInAt && s.endsAt > now);
      const shift = open ?? startable;
      if (!shift) {
        const finished = candidates.some((s) => records.get(s.id)?.checkOutAt);
        return err(
          finished ? SchedulingErrors.alreadyCheckedOut() : SchedulingErrors.noActiveShift(),
        );
      }

      const kind = open ? 'check_out' : 'check_in';
      const lateMinutes =
        kind === 'check_in'
          ? Math.max(0, Math.floor((now.getTime() - shift.startsAt.getTime()) / 60_000))
          : null;
      const saved = await this.attendance.insert({
        employeeId: me.id,
        shiftId: shift.id,
        locationId: site.id,
        kind,
        occurredAt: now,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyM: input.accuracy != null ? Math.round(input.accuracy) : null,
        distanceM,
        lateMinutes,
      });
      // A second tap in the same instant: report the first one's outcome.
      if (!saved && kind === 'check_out') return err(SchedulingErrors.alreadyCheckedOut());

      return ok(toResult(kind, now, lateMinutes, distanceM, shift, site.timezone, site.name));
    });
  }
}

function toResult(
  kind: 'check_in' | 'check_out',
  at: Date,
  lateMinutes: number | null,
  distanceM: number,
  shift: Shift,
  timezone: string,
  locationName: string,
): AttendanceResult {
  const start = utcToLocal(shift.startsAt, timezone);
  return {
    kind,
    occurredAt: at.toISOString(),
    lateMinutes,
    distanceM,
    shift: {
      id: shift.id,
      localDate: start.date,
      localStart: start.time,
      localEnd: utcToLocal(shift.endsAt, timezone).time,
      locationName,
      timezone,
    },
  };
}
