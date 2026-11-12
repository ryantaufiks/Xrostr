import { countVisits, visitsAtRisk } from '@xrostr/contracts';
import { describe, expect, it } from 'vitest';

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 13, 0, minutes));

describe('roving visit rules', () => {
  it('counts touches closer than the gap as one visit, in any order', () => {
    expect(countVisits([], 60)).toBe(0);
    expect(countVisits([at(0), at(5), at(59)], 60)).toBe(1);
    expect(countVisits([at(120), at(0), at(60)], 60)).toBe(3);
    // Measured from the last counted touch, not the last touch.
    expect(countVisits([at(0), at(40), at(80), at(100)], 60)).toBe(2);
  });

  it('flags a shift at risk when the time left is under one gap per visit owed', () => {
    const minutes = (n: number) => n * 60_000;
    expect(visitsAtRisk(0, minutes(1), 60)).toBe(false);
    expect(visitsAtRisk(1, minutes(59), 60)).toBe(true);
    expect(visitsAtRisk(1, minutes(60), 60)).toBe(false);
    expect(visitsAtRisk(2, minutes(90), 60)).toBe(true);
  });
});
