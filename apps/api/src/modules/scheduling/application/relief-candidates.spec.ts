import { describe, expect, it } from 'vitest';
import type { WorkforceEmployee } from '../../workforce/public-api.js';
import type { Shift } from './ports.js';
import { rankReliefCandidates, type ReliefContext } from './relief-candidates.js';

const employee = (id: string, extra: Partial<WorkforceEmployee> = {}): WorkforceEmployee => ({
  id,
  userId: `u-${id}`,
  legalEntityId: 'le',
  locationId: null,
  employeeNo: id,
  fullName: id,
  phone: null,
  jobTitle: null,
  employmentType: 'full_time',
  startDate: '2024-01-01',
  status: 'active',
  assignmentType: 'fixed',
  canRelieve: true,
  ...extra,
});

const shift = (
  employeeId: string,
  startsAt: string,
  endsAt: string,
  extra: Partial<Shift> = {},
): Shift => ({
  id: `${employeeId}-${startsAt}`,
  locationId: 'other-site',
  zoneId: null,
  employeeId,
  kind: 'custom',
  status: 'published',
  startsAt: new Date(startsAt),
  endsAt: new Date(endsAt),
  timezone: 'UTC',
  notes: null,
  ...extra,
});

// Cover 2026-03-04 20:00 → 03-05 08:00 at site S.
const context = (over: Partial<ReliefContext> = {}): ReliefContext => ({
  siteId: 'S',
  start: new Date('2026-03-04T20:00:00Z'),
  end: new Date('2026-03-05T08:00:00Z'),
  zoneIds: new Set(['Z']),
  shifts: [],
  onLeave: new Set(),
  allowedSites: new Map(),
  weekStart: new Date('2026-03-02T00:00:00Z'),
  weekEnd: new Date('2026-03-09T00:00:00Z'),
  weeklyLimit: 40,
  ...over,
});

describe('rankReliefCandidates', () => {
  it('orders roving on duty nearby, then standby, then off duty', () => {
    const ranked = rankReliefCandidates(
      [employee('off'), employee('standby'), employee('rover', { assignmentType: 'roving' })],
      context({
        shifts: [
          shift('rover', '2026-03-04T18:00:00Z', '2026-03-05T06:00:00Z', {
            locationId: null,
            zoneId: 'Z',
          }),
          shift('standby', '2026-03-04T18:00:00Z', '2026-03-05T10:00:00Z', {
            kind: 'standby',
            locationId: null,
          }),
        ],
      }),
    );
    expect(ranked.map((c) => [c.employee.id, c.priority])).toEqual([
      ['rover', 'roving'],
      ['standby', 'standby'],
      ['off', 'off_duty'],
    ]);
  });

  it('leaves out people who are busy, resting, on leave, not cleared or not relievers', () => {
    const ranked = rankReliefCandidates(
      [
        employee('busy'),
        employee('tired'),
        employee('leave'),
        employee('notCleared'),
        employee('noRelief', { canRelieve: false }),
        employee('roverElsewhere', { assignmentType: 'roving' }),
        employee('ok'),
      ],
      context({
        shifts: [
          shift('busy', '2026-03-04T22:00:00Z', '2026-03-05T04:00:00Z'),
          // Ends 18:00, two hours before the window: less than 11 hours of rest.
          shift('tired', '2026-03-04T08:00:00Z', '2026-03-04T18:00:00Z'),
          shift('roverElsewhere', '2026-03-04T18:00:00Z', '2026-03-05T06:00:00Z', {
            locationId: null,
            zoneId: 'other-zone',
          }),
        ],
        onLeave: new Set(['leave']),
        allowedSites: new Map([['notCleared', ['another-site']]]),
      }),
    );
    expect(ranked.map((c) => c.employee.id)).toEqual(['ok']);
  });

  it('puts the officer with fewer hours this week first and warns about the weekly limit', () => {
    const ranked = rankReliefCandidates(
      [employee('busyWeek'), employee('quietWeek')],
      context({
        shifts: [
          shift('busyWeek', '2026-03-02T08:00:00Z', '2026-03-02T20:00:00Z'),
          shift('busyWeek', '2026-03-03T08:00:00Z', '2026-03-03T20:00:00Z'),
          shift('busyWeek', '2026-03-04T00:00:00Z', '2026-03-04T08:00:00Z'),
        ],
      }),
    );
    expect(ranked.map((c) => [c.employee.id, c.weeklyHours, c.overWeeklyLimit])).toEqual([
      ['quietWeek', 0, false],
      ['busyWeek', 32, true],
    ]);
  });
});
