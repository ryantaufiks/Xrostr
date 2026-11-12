import { describe, expect, it } from 'vitest';
import {
  chargeableDays,
  completedMonths,
  completedYears,
  eachDay,
  spanDays,
} from './leave-days.js';

describe('leave days', () => {
  it('counts calendar days and skips public holidays', () => {
    expect(eachDay('2026-12-23', '2026-12-26')).toEqual([
      '2026-12-23',
      '2026-12-24',
      '2026-12-25',
      '2026-12-26',
    ]);
    expect(chargeableDays('2026-12-23', '2026-12-26', new Set(['2026-12-25']))).toBe(3);
    expect(spanDays('2026-02-27', '2026-03-02')).toBe(4);
  });

  it('counts service only once the anniversary day is reached', () => {
    expect(completedMonths('2025-11-15', '2026-11-14')).toBe(11);
    expect(completedMonths('2025-11-15', '2026-11-15')).toBe(12);
    expect(completedYears('2018-01-31', '2026-01-30')).toBe(7);
    expect(completedYears('2026-11-01', '2026-10-01')).toBe(0);
  });
});
