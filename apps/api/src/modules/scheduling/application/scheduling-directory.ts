import { Injectable } from '@nestjs/common';
import { addDays, localToUtc, utcToLocal } from '../../../shared/domain/local-time.js';
import { ShiftRepository, ZoneRepository, type Shift } from './ports.js';

/** Shifts are never longer than this, so a day of look-back finds every running one. */
const MAX_SHIFT_MS = 24 * 3_600_000;

export interface RunningShift {
  id: string;
  locationId: string | null;
  zoneId: string | null;
  /** Zone name for a roving shift; null for a site shift. */
  zoneName: string | null;
  /** Sites the shift covers: its own site, or every site of its zone. */
  siteIds: string[];
  timezone: string;
  startsAt: Date;
  endsAt: Date;
}

export interface DatedShift {
  id: string;
  status: Shift['status'];
  localDate: string;
}

/**
 * Public API of the scheduling module for other modules (leave). Must run inside the tenant's
 * unit of work.
 */
@Injectable()
export class SchedulingDirectory {
  constructor(
    private readonly shifts: ShiftRepository,
    private readonly zones: ZoneRepository,
  ) {}

  /** Live shifts of an employee whose site-local start date falls within from..to. */
  async shiftsOnDates(employeeId: string, from: string, to: string): Promise<DatedShift[]> {
    // A day of slack either side covers every site zone; then filter by local date.
    const candidates = await this.shifts.liveForEmployee(
      employeeId,
      localToUtc(addDays(from, -1), '00:00', 'UTC'),
      localToUtc(addDays(to, 2), '00:00', 'UTC'),
    );
    return candidates
      .map((s) => ({
        id: s.id,
        status: s.status,
        localDate: utcToLocal(s.startsAt, s.timezone).date,
      }))
      .filter((s) => s.localDate >= from && s.localDate <= to);
  }

  /**
   * The employee's published shift running at `at`, give or take `graceMs` either side; the
   * one that started last wins when two touch. On-call (standby) shifts are not working
   * shifts and never count here.
   */
  async runningShift(employeeId: string, at: Date, graceMs: number): Promise<RunningShift | null> {
    const candidates = await this.shifts.publishedForEmployee(
      employeeId,
      new Date(at.getTime() - MAX_SHIFT_MS - graceMs),
      new Date(at.getTime() + graceMs + 1),
    );
    const running = candidates.filter(
      (s) =>
        s.kind !== 'standby' &&
        s.startsAt.getTime() - graceMs <= at.getTime() &&
        at.getTime() < s.endsAt.getTime() + graceMs,
    );
    const shift = running.at(-1);
    if (!shift) return null;
    const zone = shift.zoneId ? await this.zones.findById(shift.zoneId) : null;
    return {
      id: shift.id,
      locationId: shift.locationId,
      zoneId: shift.zoneId,
      zoneName: zone?.name ?? null,
      siteIds: shift.locationId ? [shift.locationId] : (zone?.locations.map((l) => l.id) ?? []),
      timezone: shift.timezone,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
    };
  }

  /** Drafts are deleted, published shifts cancelled. */
  async withdraw(shifts: readonly DatedShift[]): Promise<void> {
    for (const s of shifts) {
      if (s.status === 'draft') await this.shifts.remove(s.id);
      else await this.shifts.cancel(s.id);
    }
  }
}
