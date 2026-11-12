import { describe, expect, it } from 'vitest';
import { addDays, localDaysToUtcRange, localToUtc, utcToLocal } from './local-time.js';

describe('local time at a site', () => {
  it('converts the three Indonesian zones and Singapore to UTC', () => {
    expect(localToUtc('2026-11-12', '20:00', 'Asia/Jakarta').toISOString()).toBe(
      '2026-11-12T13:00:00.000Z',
    );
    expect(localToUtc('2026-11-12', '20:00', 'Asia/Makassar').toISOString()).toBe(
      '2026-11-12T12:00:00.000Z',
    );
    expect(localToUtc('2026-11-12', '20:00', 'Asia/Jayapura').toISOString()).toBe(
      '2026-11-12T11:00:00.000Z',
    );
    expect(localToUtc('2026-11-12', '08:00', 'Asia/Singapore').toISOString()).toBe(
      '2026-11-12T00:00:00.000Z',
    );
  });

  it('handles an early-morning start that is the previous day in UTC', () => {
    expect(localToUtc('2026-11-12', '02:00', 'Asia/Jakarta').toISOString()).toBe(
      '2026-11-11T19:00:00.000Z',
    );
  });

  it('reads a night shift end back as the next local day', () => {
    const end = new Date(
      localToUtc('2026-11-12', '20:00', 'Asia/Jakarta').getTime() + 12 * 3_600_000,
    );
    expect(utcToLocal(end, 'Asia/Jakarta')).toEqual({ date: '2026-11-13', time: '08:00' });
  });

  it('respects daylight saving where a zone has it', () => {
    // Europe/Amsterdam is UTC+1 in winter and UTC+2 in summer.
    expect(localToUtc('2026-01-15', '09:00', 'Europe/Amsterdam').toISOString()).toBe(
      '2026-01-15T08:00:00.000Z',
    );
    expect(localToUtc('2026-07-15', '09:00', 'Europe/Amsterdam').toISOString()).toBe(
      '2026-07-15T07:00:00.000Z',
    );
  });

  it('builds the UTC window of a run of local days', () => {
    const range = localDaysToUtcRange('2026-11-09', '2026-11-15', 'Asia/Jakarta');
    expect(range.start.toISOString()).toBe('2026-11-08T17:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-11-15T17:00:00.000Z');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
