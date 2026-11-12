import type { ShiftConflict } from '@xrostr/contracts';
import { addDays, utcToLocal } from '../../../shared/domain/local-time.js';
import type { WorkforceEmployee } from '../../workforce/public-api.js';
import type { LeaveSpan, Shift } from './ports.js';

/** Minimum rest between two shifts, in hours. */
export const MIN_REST_HOURS = 11;
/** Warn once an officer has this many consecutive night shifts. */
export const MAX_CONSECUTIVE_NIGHTS = 4;

const HOUR_MS = 3_600_000;

/**
 * Pure rule engine for the weekly roster. Flags, per employee:
 *  - a shift on an approved-leave day,
 *  - a shift starting less than MIN_REST_HOURS after the previous one,
 *  - weekly hours above the statutory limit,
 *  - a run of consecutive night shifts at or past the threshold.
 * Only shifts whose site-local date is inside from..to are flagged; the previous shift used for
 * the rest rule may sit just before `from`.
 */
export function computeConflicts(
  employees: readonly WorkforceEmployee[],
  shifts: readonly Shift[],
  leaves: readonly LeaveSpan[],
  from: string,
  to: string,
  weeklyLimit: number,
  timezone: string,
): ShiftConflict[] {
  const nameOf = new Map(employees.map((e) => [e.id, e.fullName]));
  const leaveDates = new Map<string, Set<string>>();
  for (const span of leaves) {
    const set = leaveDates.get(span.employeeId) ?? new Set<string>();
    for (let d = span.startDate; d <= span.endDate && d <= to; d = addDays(d, 1)) {
      if (d >= from) set.add(d);
    }
    leaveDates.set(span.employeeId, set);
  }

  const conflicts: ShiftConflict[] = [];
  for (const [employeeId, theirs] of Map.groupBy(shifts, (s) => s.employeeId)) {
    const name = nameOf.get(employeeId) ?? employeeId;
    const ordered = theirs.slice().sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    // On-call hours are not working hours: they do not count toward the weekly limit.
    const working = ordered.filter((s) => {
      const d = utcToLocal(s.startsAt, timezone).date;
      return d >= from && d <= to && s.kind !== 'standby';
    });
    const totalHours = working.reduce(
      (n, s) => n + (s.endsAt.getTime() - s.startsAt.getTime()) / HOUR_MS,
      0,
    );
    if (totalHours > weeklyLimit) {
      conflicts.push({
        kind: 'weekly_hours',
        employeeId,
        employeeName: name,
        shiftId: null,
        localDate: from,
        detail: Math.round(totalHours),
      });
    }

    for (let i = 0; i < ordered.length; i++) {
      const shift = ordered[i]!;
      const localDate = utcToLocal(shift.startsAt, timezone).date;
      if (localDate < from || localDate > to) continue;

      if (leaveDates.get(employeeId)?.has(localDate)) {
        conflicts.push({
          kind: 'leave',
          employeeId,
          employeeName: name,
          shiftId: shift.id,
          localDate,
          detail: 0,
        });
      }

      // On-call shifts are not "work": no rest or consecutive-night rules.
      if (shift.kind === 'standby') continue;

      // Rest is measured against the previous working shift, skipping on-call gaps.
      let previous: Shift | undefined;
      for (let j = i - 1; j >= 0; j--) {
        if (ordered[j]!.kind !== 'standby') {
          previous = ordered[j]!;
          break;
        }
      }
      if (previous) {
        const gap = (shift.startsAt.getTime() - previous.endsAt.getTime()) / HOUR_MS;
        if (gap < MIN_REST_HOURS) {
          conflicts.push({
            kind: 'rest',
            employeeId,
            employeeName: name,
            shiftId: shift.id,
            localDate,
            detail: Math.round(gap * 10) / 10,
          });
        }
      }

      if (shift.kind === 'night') {
        let run = 1;
        for (let j = i - 1; j >= 0 && ordered[j]!.kind === 'night'; j--) run++;
        if (run >= MAX_CONSECUTIVE_NIGHTS) {
          conflicts.push({
            kind: 'consecutive_nights',
            employeeId,
            employeeName: name,
            shiftId: shift.id,
            localDate,
            detail: run,
          });
        }
      }
    }
  }

  return conflicts.sort(
    (a, b) =>
      a.employeeName.localeCompare(b.employeeName) || a.localDate.localeCompare(b.localDate),
  );
}
