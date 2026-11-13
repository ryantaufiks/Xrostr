import { expandRotation, parseRotation } from '@xrostr/contracts';
import { describe, expect, it } from 'vitest';
import type { WorkforceEmployee } from '../../workforce/public-api.js';
import type { Shift } from './ports.js';
import { suggestFill, type SuggestionContext } from './roster-suggestions.js';

const employee = (id: string, extra: Partial<WorkforceEmployee> = {}): WorkforceEmployee => ({
  id,
  userId: `u-${id}`,
  legalEntityId: 'le',
  locationId: 'S',
  employeeNo: id,
  fullName: id,
  phone: null,
  jobTitle: null,
  employmentType: 'full_time',
  startDate: '2024-01-01',
  status: 'active',
  assignmentType: 'fixed',
  canRelieve: false,
  ...extra,
});

const shift = (employeeId: string, date: string, kind: 'day' | 'night', site = 'S'): Shift => {
  const startsAt = new Date(`${date}T${kind === 'day' ? '08' : '20'}:00:00Z`);
  return {
    id: `${employeeId}-${date}-${kind}`,
    locationId: site,
    zoneId: null,
    employeeId,
    kind,
    status: 'draft',
    startsAt,
    endsAt: new Date(startsAt.getTime() + 12 * 3_600_000),
    timezone: 'UTC',
    notes: null,
  };
};

// 2026-03-02 is a Monday. One day and one night officer wanted every day.
const context = (over: Partial<SuggestionContext> = {}): SuggestionContext => ({
  siteId: 'S',
  timezone: 'UTC',
  days: ['2026-03-02'],
  requirements: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, dayCount: 1, nightCount: 1 })),
  shifts: [],
  leaves: [],
  allowedSites: new Map(),
  weeklyLimit: 40,
  ...over,
});

describe('suggestFill', () => {
  it('fills what is missing, home officers first, and never the same person twice a day', () => {
    const result = suggestFill(
      [employee('Ana'), employee('Budi', { locationId: 'X' }), employee('Cici')],
      context({ shifts: [shift('Cici', '2026-03-02', 'day')] }),
    );
    // The day shift is already covered by Cici; the night goes to Ana (based here, no hours).
    expect(result.suggestions.map((s) => [s.kind, s.employee.id, s.homeSite])).toEqual([
      ['night', 'Ana', true],
    ]);
    expect(result.unfilled).toEqual([]);
  });

  it('leaves out leave, other-site clearance, roving officers and short rest', () => {
    const result = suggestFill(
      [
        employee('OnLeave'),
        employee('NotCleared', { locationId: 'X' }),
        employee('Rover', { assignmentType: 'roving' }),
        employee('Tired'),
      ],
      context({
        leaves: [{ employeeId: 'OnLeave', startDate: '2026-03-02', endDate: '2026-03-02' }],
        allowedSites: new Map([['NotCleared', ['X']]]),
        // Night ending 08:00 on the 2nd elsewhere: too little rest for the day shift, and the
        // night shift is just 12 hours later, which is fine.
        shifts: [shift('Tired', '2026-03-01', 'night', 'X')],
      }),
    );
    expect(result.suggestions.map((s) => [s.kind, s.employee.id])).toEqual([['night', 'Tired']]);
    expect(result.unfilled).toEqual([{ date: '2026-03-02', kind: 'day', missing: 1 }]);
  });

  it('respects the weekly limit and stops before a long run of nights', () => {
    const week = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05'];
    const result = suggestFill(
      [employee('Ana')],
      context({
        days: week,
        requirements: [1, 2, 3, 4].map((weekday) => ({ weekday, dayCount: 0, nightCount: 1 })),
        weeklyLimit: 100,
      }),
    );
    // Three nights, then the fourth would reach the consecutive-nights warning.
    expect(result.suggestions.map((s) => s.date)).toEqual(week.slice(0, 3));
    expect(result.unfilled).toEqual([{ date: '2026-03-05', kind: 'night', missing: 1 }]);

    const capped = suggestFill(
      [employee('Ana')],
      context({ days: week.slice(0, 2), weeklyLimit: 12 }),
    );
    expect(capped.suggestions).toHaveLength(1);
  });
});

describe('rotation patterns', () => {
  it('reads letters in both languages and repeats from the chosen step', () => {
    expect(parseRotation('P P M M L L')).toEqual(['day', 'day', 'night', 'night', 'off', 'off']);
    expect(parseRotation('d,n,o')).toEqual(['day', 'night', 'off']);
    expect(parseRotation('PX')).toBeNull();
    expect(
      expandRotation(['day', 'night', 'off'], '2026-02-27', '2026-03-03', 1).map((d) => d.step),
    ).toEqual(['night', 'off', 'day', 'night', 'off']);
    expect(expandRotation(['day'], '2026-02-28', '2026-03-01').map((d) => d.date)).toEqual([
      '2026-02-28',
      '2026-03-01',
    ]);
  });
});
