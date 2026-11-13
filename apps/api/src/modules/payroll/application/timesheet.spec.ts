import { describe, expect, it } from 'vitest';
import {
  computeTimesheets,
  weekRange,
  type TimesheetInput,
  type TimesheetShift,
} from './timesheet.js';

// Indonesia: 7 h a day on a six-day week, 8 h on a five-day week, 40 h a week. Times in UTC.
const ID_TIME = {
  dailyMinutes: { 5: 480, 6: 420 } as const,
  weeklyMinutes: 2400,
  basis: 'test',
};

let seq = 0;
const shift = (date: string, start = '08:00', hours = 12, extra: Partial<TimesheetShift> = {}) => {
  const startsAt = new Date(`${date}T${start}:00Z`);
  return {
    id: `s${++seq}`,
    employeeId: 'ana',
    kind: start >= '18:00' ? 'night' : 'day',
    startsAt,
    endsAt: new Date(startsAt.getTime() + hours * 3_600_000),
    timezone: 'UTC',
    place: 'Site A',
    replacesShiftId: null,
    ...extra,
  } satisfies TimesheetShift;
};
const worked = (s: TimesheetShift, lateMin = 0, earlyMin = 0) =>
  [
    s.id,
    {
      checkInAt: new Date(s.startsAt.getTime() + lateMin * 60_000),
      checkOutAt: new Date(s.endsAt.getTime() - earlyMin * 60_000),
    },
  ] as const;

const input = (over: Partial<TimesheetInput>): TimesheetInput => ({
  from: '2026-03-01',
  to: '2026-03-31',
  now: new Date('2026-04-15T00:00:00Z'),
  shifts: [],
  punches: new Map(),
  corrections: new Map(),
  leaves: [],
  holidays: new Set(),
  workingTime: ID_TIME,
  workDaysPerWeek: new Map(),
  defaultWorkDaysPerWeek: 5,
  roundingMinutes: 15,
  lateGraceMinutes: 5,
  ...over,
});

describe('computeTimesheets', () => {
  it('counts overtime past the daily limit, and past the weekly limit, never twice', () => {
    // Mon–Fri 2026-03-02..06: five 12 h days on a five-day week. Daily excess 5 × 4 h = 20 h;
    // weekly excess 60 − 40 = 20 h. Overtime is 20 h, not 40.
    const week = ['02', '03', '04', '05', '06'].map((d) => shift(`2026-03-${d}`));
    const [sheet] = computeTimesheets(
      input({ shifts: week, punches: new Map(week.map((s) => worked(s))) }),
    );
    expect(sheet!.totals).toMatchObject({
      daysWorked: 5,
      workedMinutes: 60 * 60,
      overtimeMinutes: 20 * 60,
      restDayMinutes: 0,
    });
    expect(sheet!.entries.map((e) => e.overtimeMinutes)).toEqual([240, 240, 240, 240, 240]);
  });

  it('uses the weekly limit when it gives more, on a six-day week', () => {
    // Six 8 h days: daily excess 6 × 1 h = 6 h; weekly 48 − 40 = 8 h. The extra 2 h go to the
    // last shift of the week.
    const week = ['02', '03', '04', '05', '06', '07'].map((d) => shift(`2026-03-${d}`, '08:00', 8));
    const [sheet] = computeTimesheets(
      input({
        shifts: week,
        punches: new Map(week.map((s) => worked(s))),
        workDaysPerWeek: new Map([['ana', 6]]),
      }),
    );
    expect(sheet!.totals.overtimeMinutes).toBe(8 * 60);
    expect(sheet!.entries.map((e) => e.overtimeMinutes)).toEqual([60, 60, 60, 60, 60, 180]);
  });

  it('puts rest-day and holiday work apart from overtime', () => {
    // Six 8 h days on a five-day week: Saturday is a rest day. Wednesday is a holiday.
    const week = ['02', '03', '04', '05', '06', '07'].map((d) => shift(`2026-03-${d}`, '08:00', 8));
    const [sheet] = computeTimesheets(
      input({
        shifts: week,
        punches: new Map(week.map((s) => worked(s))),
        holidays: new Set(['2026-03-04']),
      }),
    );
    const flags = sheet!.entries.map((e) => [e.localDate.slice(8), e.restDay, e.publicHoliday]);
    expect(flags).toEqual([
      ['02', false, false],
      ['03', false, false],
      ['04', false, true],
      ['05', false, false],
      ['06', false, false],
      ['07', false, false],
    ]);
    // With the holiday out, five normal days of 8 h: no overtime; 8 h of holiday work.
    expect(sheet!.totals).toMatchObject({ overtimeMinutes: 0, publicHolidayMinutes: 480 });

    const seven = ['02', '03', '04', '05', '06', '07', '08'].map((d) =>
      shift(`2026-03-${d}`, '08:00', 8),
    );
    const [busy] = computeTimesheets(
      input({ shifts: seven, punches: new Map(seven.map((s) => worked(s))) }),
    );
    expect(busy!.entries.filter((e) => e.restDay).map((e) => e.localDate)).toEqual([
      '2026-03-07',
      '2026-03-08',
    ]);
    expect(busy!.totals.restDayMinutes).toBe(16 * 60);
  });

  it('forgives lateness within the grace, rounds down, and reports early leave', () => {
    const a = shift('2026-03-02');
    const b = shift('2026-03-03');
    const [sheet] = computeTimesheets(
      input({ shifts: [a, b], punches: new Map([worked(a, 4), worked(b, 20, 50)]) }),
    );
    const [onTime, late] = sheet!.entries;
    expect(onTime).toMatchObject({ lateMinutes: 0, workedMinutes: 720 });
    // 12 h − 20 min late − 50 min early = 10 h 50 → rounded down to 10 h 45.
    expect(late).toMatchObject({ lateMinutes: 20, earlyLeaveMinutes: 50, workedMinutes: 645 });
  });

  it('marks absences, leave, open check-ins and corrections', () => {
    const absent = shift('2026-03-02');
    const onLeave = shift('2026-03-03');
    const open = shift('2026-03-04');
    const fixed = shift('2026-03-05');
    const future = shift('2026-04-20');
    const [sheet] = computeTimesheets(
      input({
        to: '2026-04-30',
        shifts: [absent, onLeave, open, fixed, future],
        punches: new Map([
          [open.id, { checkInAt: open.startsAt, checkOutAt: null }],
          [fixed.id, { checkInAt: fixed.startsAt, checkOutAt: null }],
        ]),
        corrections: new Map([
          [
            fixed.id,
            { checkOut: fixed.endsAt, reason: 'Forgot to scan', by: 'Spv', at: fixed.endsAt },
          ],
        ]),
        leaves: [
          { employeeId: 'ana', startDate: '2026-03-03', endDate: '2026-03-03', paid: false },
        ],
      }),
    );
    expect(sheet!.entries.map((e) => e.status)).toEqual([
      'absent',
      'leave',
      'incomplete',
      'worked',
      'upcoming',
    ]);
    expect(sheet!.entries[3]).toMatchObject({ corrected: true, workedMinutes: 720 });
    expect(sheet!.totals).toMatchObject({ absences: 1, incomplete: 1, unpaidLeaveDays: 1 });
  });

  it('counts standby time and call-outs, but not a roving officer pulled off duty', () => {
    const standby = shift('2026-03-02', '08:00', 12, { kind: 'standby' });
    const relief = shift('2026-03-02', '20:00', 12, { replacesShiftId: 'orig' });
    const roving = shift('2026-03-03', '08:00', 4);
    const pulled = shift('2026-03-03', '12:00', 8, { replacesShiftId: 'orig2' });
    const [sheet] = computeTimesheets(
      input({
        shifts: [standby, relief, roving, pulled],
        punches: new Map([worked(relief), worked(roving), worked(pulled)]),
      }),
    );
    expect(sheet!.totals).toMatchObject({ standbyShifts: 1, standbyMinutes: 720, callouts: 1 });
    expect(sheet!.entries.find((e) => e.shiftId === pulled.id)!.callout).toBe(false);
  });

  it('counts whole weeks across the period edge, reporting only the period’s days', () => {
    // Week of Mon 30 March: three 12 h days in March, two in April (five-day week).
    expect(weekRange('2026-03-01', '2026-03-31')).toEqual({ from: '2026-02-23', to: '2026-04-05' });
    const days = ['2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02', '2026-04-03'].map((d) =>
      shift(d),
    );
    const [march] = computeTimesheets(
      input({ shifts: days, punches: new Map(days.map((s) => worked(s))) }),
    );
    expect(march!.entries.map((e) => e.localDate)).toEqual(['2026-03-30', '2026-03-31']);
    expect(march!.totals.overtimeMinutes).toBe(2 * 240);
  });
});
