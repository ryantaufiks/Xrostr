import type {
  TimesheetEntry,
  TimesheetStatus,
  TimesheetTotals,
  WorkingTimeRule,
} from '@xrostr/contracts';
import { addDays, utcToLocal } from '../../../shared/domain/local-time.js';

const MINUTE = 60_000;

/** A published shift with what the timesheet needs about it. */
export interface TimesheetShift {
  id: string;
  employeeId: string;
  kind: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  place: string;
  replacesShiftId: string | null;
}

export interface Punches {
  checkInAt: Date | null;
  checkOutAt: Date | null;
}

export interface Correction {
  checkIn?: Date | null;
  checkOut?: Date | null;
  reason: string;
  by: string;
  at: Date;
}

export interface TimesheetInput {
  from: string;
  to: string;
  now: Date;
  shifts: readonly TimesheetShift[];
  punches: ReadonlyMap<string, Punches>;
  corrections: ReadonlyMap<string, Correction>;
  /** Approved leave, inclusive local dates. */
  leaves: readonly { employeeId: string; startDate: string; endDate: string; paid: boolean }[];
  holidays: ReadonlySet<string>;
  workingTime: WorkingTimeRule;
  workDaysPerWeek: ReadonlyMap<string, 5 | 6>;
  defaultWorkDaysPerWeek: 5 | 6;
  roundingMinutes: number;
  lateGraceMinutes: number;
}

export interface EmployeeTimesheet {
  employeeId: string;
  workDaysPerWeek: 5 | 6;
  totals: TimesheetTotals;
  entries: TimesheetEntry[];
}

const minutes = (a: Date, b: Date) => Math.max(0, Math.floor((b.getTime() - a.getTime()) / MINUTE));
const roundDown = (m: number, step: number) => Math.floor(m / step) * step;
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
const mondayOf = (date: string) => addDays(date, 1 - weekdayOf(date));

/** The whole Monday–Sunday weeks around a period: the shifts the timesheet needs to see. */
export function weekRange(from: string, to: string): { from: string; to: string } {
  return { from: mondayOf(from), to: addDays(mondayOf(to), 6) };
}

/**
 * Builds each officer's timesheet from published shifts, attendance, corrections, approved leave
 * and public holidays. Pure: the same input always gives the same timesheet.
 *
 * - Worked time runs from check-in (or the shift start, when lateness is within the grace) to
 *   check-out, capped to the shift, rounded down to the policy's step.
 * - Overtime on a normal working day is the larger of the minutes past the daily limit, summed
 *   over the week, and the minutes past the weekly limit, so nothing is counted twice.
 * - Work on a public holiday, or on a day past the officer's working days in that week, is a
 *   rest-day or holiday hour, reported apart from overtime (each country pays it differently).
 * - A shift counts on the local date it starts.
 * - Weeks are whole Monday–Sunday weeks, so the caller passes the shifts of `weekRange(from, to)`;
 *   a week split by the period end is counted in full, and its days are reported in their period.
 */
export function computeTimesheets(input: TimesheetInput): EmployeeTimesheet[] {
  const leaveOf = new Map<string, Map<string, boolean>>();
  for (const l of input.leaves) {
    const days = leaveOf.get(l.employeeId) ?? new Map<string, boolean>();
    for (let d = l.startDate; d <= l.endDate; d = addDays(d, 1)) days.set(d, l.paid);
    leaveOf.set(l.employeeId, days);
  }

  const byEmployee = new Map<string, TimesheetShift[]>();
  for (const s of input.shifts) {
    const list = byEmployee.get(s.employeeId) ?? [];
    list.push(s);
    byEmployee.set(s.employeeId, list);
  }
  const employeeIds = new Set([...byEmployee.keys(), ...leaveOf.keys()]);

  return [...employeeIds].map((employeeId) => {
    const workDays = input.workDaysPerWeek.get(employeeId) ?? input.defaultWorkDaysPerWeek;
    const dailyLimit = input.workingTime.dailyMinutes[workDays];
    const theirs = (byEmployee.get(employeeId) ?? [])
      .slice()
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const leaveDays = leaveOf.get(employeeId) ?? new Map<string, boolean>();

    const entries: TimesheetEntry[] = [];
    // Working dates seen so far per week, to tell the rest days.
    const workDatesByWeek = new Map<string, Set<string>>();

    for (const shift of theirs) {
      const start = utcToLocal(shift.startsAt, shift.timezone);
      const date = start.date;
      // Whole weeks are computed (see `weekRange`); only the period's days are reported.
      if (date < mondayOf(input.from) || date > addDays(mondayOf(input.to), 6)) continue;

      const punch = input.punches.get(shift.id) ?? { checkInAt: null, checkOutAt: null };
      const fix = input.corrections.get(shift.id);
      const checkIn = fix && fix.checkIn !== undefined ? fix.checkIn : punch.checkInAt;
      const checkOut = fix && fix.checkOut !== undefined ? fix.checkOut : punch.checkOutAt;
      const scheduled = minutes(shift.startsAt, shift.endsAt);
      const ended = shift.endsAt <= input.now;

      let status: TimesheetStatus;
      if (shift.kind === 'standby') status = 'standby';
      else if (checkIn && checkOut) status = 'worked';
      else if (checkIn) status = ended ? 'incomplete' : 'upcoming';
      else if (leaveDays.has(date)) status = 'leave';
      else status = ended ? 'absent' : 'upcoming';

      let worked = 0;
      let late = 0;
      let early = 0;
      if (status === 'worked' && checkIn && checkOut) {
        const rawLate = minutes(shift.startsAt, checkIn);
        late = rawLate > input.lateGraceMinutes ? rawLate : 0;
        const from = late > 0 ? checkIn : shift.startsAt;
        const until = checkOut < shift.endsAt ? checkOut : shift.endsAt;
        early = minutes(checkOut, shift.endsAt);
        worked = roundDown(minutes(from, until), input.roundingMinutes);
      }

      const holiday = input.holidays.has(date);
      let restDay = false;
      if (worked > 0 && !holiday) {
        const week = mondayOf(date);
        const dates = workDatesByWeek.get(week) ?? new Set<string>();
        if (!dates.has(date) && dates.size >= workDays) restDay = true;
        else dates.add(date);
        workDatesByWeek.set(week, dates);
      }
      const callout =
        shift.replacesShiftId !== null &&
        // A roving officer pulled off their zone was already on duty: not a call-out.
        !theirs.some(
          (o) =>
            o.id !== shift.id &&
            o.kind !== 'standby' &&
            o.endsAt.getTime() === shift.startsAt.getTime(),
        );

      entries.push({
        shiftId: shift.id,
        localDate: date,
        localStart: start.time,
        localEnd: utcToLocal(shift.endsAt, shift.timezone).time,
        timezone: shift.timezone,
        kind: shift.kind,
        place: shift.place,
        status,
        checkInAt: checkIn?.toISOString() ?? null,
        checkOutAt: checkOut?.toISOString() ?? null,
        scheduledMinutes: scheduled,
        workedMinutes: worked,
        lateMinutes: late,
        earlyLeaveMinutes: status === 'worked' ? early : 0,
        overtimeMinutes: 0,
        restDay,
        publicHoliday: holiday && worked > 0,
        standbyMinutes: status === 'standby' ? scheduled : 0,
        callout,
        nightShift: shift.kind === 'night',
        corrected: !!fix,
        correction: fix ? { reason: fix.reason, by: fix.by, at: fix.at.toISOString() } : null,
      });
    }

    assignOvertime(entries, dailyLimit, input.workingTime.weeklyMinutes);
    const inPeriod = entries.filter((e) => e.localDate >= input.from && e.localDate <= input.to);

    let paidLeaveDays = 0;
    let unpaidLeaveDays = 0;
    for (const [date, paid] of leaveDays) {
      if (date < input.from || date > input.to) continue;
      if (paid) paidLeaveDays++;
      else unpaidLeaveDays++;
    }
    return {
      employeeId,
      workDaysPerWeek: workDays,
      totals: totalsOf(inPeriod, paidLeaveDays, unpaidLeaveDays),
      entries: inPeriod,
    };
  });
}

/**
 * Per week: overtime = max(sum of daily excess, weekly excess) over normal working days, spread
 * back onto the days (daily excess first, the rest on the latest days of the week).
 */
function assignOvertime(entries: TimesheetEntry[], dailyLimit: number, weeklyLimit: number) {
  const weeks = new Map<string, TimesheetEntry[]>();
  for (const e of entries) {
    if (e.workedMinutes === 0 || e.restDay || e.publicHoliday) continue;
    const week = mondayOf(e.localDate);
    weeks.set(week, [...(weeks.get(week) ?? []), e]);
  }
  for (const list of weeks.values()) {
    const perDate = new Map<string, number>();
    for (const e of list)
      perDate.set(e.localDate, (perDate.get(e.localDate) ?? 0) + e.workedMinutes);
    const dailyExcess = [...perDate.values()].reduce((n, m) => n + Math.max(0, m - dailyLimit), 0);
    const weeklyExcess = Math.max(
      0,
      [...perDate.values()].reduce((n, m) => n + m, 0) - weeklyLimit,
    );
    let remaining = Math.max(dailyExcess, weeklyExcess);
    if (remaining === 0) continue;

    // Daily excess sits on the long days themselves.
    const used = new Map<string, number>();
    for (const e of list) {
      const dayTotal = perDate.get(e.localDate)!;
      const already = used.get(e.localDate) ?? 0;
      const over = Math.max(0, dayTotal - dailyLimit) - already;
      const take = Math.min(over, e.workedMinutes, remaining);
      if (take > 0) {
        e.overtimeMinutes += take;
        used.set(e.localDate, already + take);
        remaining -= take;
      }
    }
    // Weekly excess beyond that lands on the latest shifts of the week.
    for (const e of [...list].reverse()) {
      if (remaining === 0) break;
      const take = Math.min(e.workedMinutes - e.overtimeMinutes, remaining);
      e.overtimeMinutes += take;
      remaining -= take;
    }
  }
}

function totalsOf(entries: TimesheetEntry[], paidLeaveDays: number, unpaidLeaveDays: number) {
  const totals: TimesheetTotals = {
    shifts: 0,
    daysWorked: 0,
    workedMinutes: 0,
    overtimeMinutes: 0,
    restDayMinutes: 0,
    publicHolidayMinutes: 0,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    absences: 0,
    incomplete: 0,
    standbyMinutes: 0,
    standbyShifts: 0,
    callouts: 0,
    nightShifts: 0,
    paidLeaveDays,
    unpaidLeaveDays,
  };
  const workedDates = new Set<string>();
  for (const e of entries) {
    if (e.status === 'standby') {
      totals.standbyShifts++;
      totals.standbyMinutes += e.standbyMinutes;
      continue;
    }
    totals.shifts++;
    if (e.workedMinutes > 0) workedDates.add(e.localDate);
    totals.workedMinutes += e.workedMinutes;
    totals.overtimeMinutes += e.overtimeMinutes;
    if (e.restDay) totals.restDayMinutes += e.workedMinutes;
    if (e.publicHoliday) totals.publicHolidayMinutes += e.workedMinutes;
    totals.lateMinutes += e.lateMinutes;
    totals.earlyLeaveMinutes += e.earlyLeaveMinutes;
    if (e.status === 'absent') totals.absences++;
    if (e.status === 'incomplete') totals.incomplete++;
    if (e.callout && e.workedMinutes > 0) totals.callouts++;
    if (e.nightShift && e.workedMinutes > 0) totals.nightShifts++;
  }
  totals.daysWorked = workedDates.size;
  return totals;
}
