import { describe, expect, it } from 'vitest';
import type { WorkforceEmployee } from '../../workforce/public-api.js';
import type { Shift } from './ports.js';
import {
  computeConflicts,
  MAX_CONSECUTIVE_NIGHTS,
  MIN_REST_HOURS,
} from './scheduling-conflicts.js';

const employee = (id: string, name: string): WorkforceEmployee => ({
  id,
  userId: `u-${id}`,
  legalEntityId: 'le1',
  locationId: null,
  employeeNo: id,
  fullName: name,
  phone: null,
  jobTitle: null,
  employmentType: 'full_time',
  startDate: '2020-01-01',
  status: 'active',
  assignmentType: 'fixed',
  canRelieve: false,
});

const shift = (id: string, kind: Shift['kind'], startsAt: string, endsAt: string): Shift => ({
  id,
  locationId: 'l1',
  zoneId: null,
  employeeId: 'e1',
  kind,
  status: 'draft',
  startsAt: new Date(startsAt),
  endsAt: new Date(endsAt),
  timezone: 'UTC',
  notes: null,
});

const WEEK = { from: '2026-01-05', to: '2026-01-11' }; // Monday..Sunday

describe('computeConflicts', () => {
  it('flags a shift that starts with too little rest', () => {
    const conflicts = computeConflicts(
      [employee('e1', 'Slamet')],
      [
        shift('a', 'day', '2026-01-05T00:00:00Z', '2026-01-05T08:00:00Z'),
        shift('b', 'day', '2026-01-05T15:00:00Z', '2026-01-05T23:00:00Z'),
      ],
      [],
      WEEK.from,
      WEEK.to,
      40,
      'UTC',
    );
    expect(conflicts.some((c) => c.kind === 'rest' && c.shiftId === 'b')).toBe(true);
    expect(conflicts.find((c) => c.kind === 'rest')!.detail).toBeLessThan(MIN_REST_HOURS);
  });

  it('flags a shift on an approved-leave day', () => {
    const conflicts = computeConflicts(
      [employee('e1', 'Slamet')],
      [shift('a', 'day', '2026-01-06T00:00:00Z', '2026-01-06T12:00:00Z')],
      [{ employeeId: 'e1', startDate: '2026-01-06', endDate: '2026-01-06' }],
      WEEK.from,
      WEEK.to,
      40,
      'UTC',
    );
    expect(conflicts.some((c) => c.kind === 'leave')).toBe(true);
  });

  it('flags weekly hours above the limit', () => {
    const conflicts = computeConflicts(
      [employee('e1', 'Slamet')],
      [
        shift('a', 'day', '2026-01-05T00:00:00Z', '2026-01-05T12:00:00Z'),
        shift('b', 'day', '2026-01-06T00:00:00Z', '2026-01-06T12:00:00Z'),
        shift('c', 'day', '2026-01-07T00:00:00Z', '2026-01-07T12:00:00Z'),
        shift('d', 'day', '2026-01-08T00:00:00Z', '2026-01-08T12:00:00Z'),
      ],
      [],
      WEEK.from,
      WEEK.to,
      40,
      'UTC',
    );
    const weekly = conflicts.find((c) => c.kind === 'weekly_hours');
    expect(weekly).toBeTruthy();
    expect(weekly!.detail).toBe(48);
  });

  it('ignores on-call hours in the weekly total', () => {
    const conflicts = computeConflicts(
      [employee('e1', 'Slamet')],
      [
        shift('a', 'day', '2026-01-05T00:00:00Z', '2026-01-05T12:00:00Z'),
        shift('b', 'day', '2026-01-06T00:00:00Z', '2026-01-06T12:00:00Z'),
        shift('c', 'day', '2026-01-07T00:00:00Z', '2026-01-07T12:00:00Z'),
        shift('d', 'standby', '2026-01-08T00:00:00Z', '2026-01-08T12:00:00Z'),
      ],
      [],
      WEEK.from,
      WEEK.to,
      40,
      'UTC',
    );
    expect(conflicts.some((c) => c.kind === 'weekly_hours')).toBe(false);
  });

  it('flags a run of consecutive nights', () => {
    const nights = [0, 1, 2, 3].map((i) =>
      shift(`n${i}`, 'night', `2026-01-0${5 + i}T20:00:00Z`, `2026-01-0${6 + i}T08:00:00Z`),
    );
    const conflicts = computeConflicts(
      [employee('e1', 'Slamet')],
      nights,
      [],
      WEEK.from,
      WEEK.to,
      40,
      'UTC',
    );
    const runs = conflicts.filter((c) => c.kind === 'consecutive_nights');
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((c) => c.detail >= MAX_CONSECUTIVE_NIGHTS)).toBe(true);
  });

  it('does not count nights separated by a day off as consecutive', () => {
    // Mon, Wed, Thu, Fri nights: Tuesday off breaks the run, so the longest run is 3.
    const nights = [5, 7, 8, 9].map((d) =>
      shift(
        `n${d}`,
        'night',
        `2026-01-0${d}T20:00:00Z`,
        `2026-01-${String(d + 1).padStart(2, '0')}T08:00:00Z`,
      ),
    );
    const conflicts = computeConflicts(
      [employee('e1', 'Slamet')],
      nights,
      [],
      WEEK.from,
      WEEK.to,
      100,
      'UTC',
    );
    expect(conflicts.filter((c) => c.kind === 'consecutive_nights')).toEqual([]);
  });

  it('flags a site the officer is not cleared to guard, but never their main site', () => {
    const atSite = (id: string, locationId: string) => ({
      ...shift(id, 'day', '2026-01-06T00:00:00Z', '2026-01-06T08:00:00Z'),
      locationId,
    });
    const conflicts = computeConflicts(
      [{ ...employee('e1', 'Slamet'), locationId: 'home' }],
      [
        atSite('s1', 'home'),
        {
          ...atSite('s2', 'cleared'),
          startsAt: new Date('2026-01-07T00:00:00Z'),
          endsAt: new Date('2026-01-07T08:00:00Z'),
        },
        {
          ...atSite('s3', 'other'),
          startsAt: new Date('2026-01-08T00:00:00Z'),
          endsAt: new Date('2026-01-08T08:00:00Z'),
        },
      ],
      [],
      WEEK.from,
      WEEK.to,
      100,
      'UTC',
      new Map([['e1', ['cleared']]]),
    );
    expect(conflicts.filter((c) => c.kind === 'site_not_allowed').map((c) => c.shiftId)).toEqual([
      's3',
    ]);
  });
});
