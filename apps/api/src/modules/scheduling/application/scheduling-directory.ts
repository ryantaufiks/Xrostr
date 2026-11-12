import { Injectable } from '@nestjs/common';
import { WorkforceDirectory } from '../../workforce/public-api.js';
import { addDays, localToUtc, utcToLocal } from '../../../shared/domain/local-time.js';
import { ShiftRepository, type Shift } from './ports.js';

/** Shifts are never longer than this, so a day of look-back finds every running one. */
const MAX_SHIFT_MS = 24 * 3_600_000;

export interface RunningShift {
  id: string;
  locationId: string;
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
    private readonly workforce: WorkforceDirectory,
  ) {}

  /** Live shifts of an employee whose site-local start date falls within from..to. */
  async shiftsOnDates(employeeId: string, from: string, to: string): Promise<DatedShift[]> {
    // A day of slack either side covers every site zone; then filter by local date.
    const candidates = await this.shifts.liveForEmployee(
      employeeId,
      localToUtc(addDays(from, -1), '00:00', 'UTC'),
      localToUtc(addDays(to, 2), '00:00', 'UTC'),
    );
    const sites = await this.workforce.locationsById(candidates.map((s) => s.locationId));
    return candidates
      .map((s) => ({
        id: s.id,
        status: s.status,
        localDate: utcToLocal(s.startsAt, sites.get(s.locationId)?.timezone ?? 'UTC').date,
      }))
      .filter((s) => s.localDate >= from && s.localDate <= to);
  }

  /**
   * The employee's published shift running at `at`, give or take `graceMs` either side; the
   * one that started last wins when two touch.
   */
  async runningShift(employeeId: string, at: Date, graceMs: number): Promise<RunningShift | null> {
    const candidates = await this.shifts.publishedForEmployee(
      employeeId,
      new Date(at.getTime() - MAX_SHIFT_MS - graceMs),
      new Date(at.getTime() + graceMs + 1),
    );
    const running = candidates.filter(
      (s) =>
        s.startsAt.getTime() - graceMs <= at.getTime() &&
        at.getTime() < s.endsAt.getTime() + graceMs,
    );
    const shift = running.at(-1);
    return shift
      ? {
          id: shift.id,
          locationId: shift.locationId,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
        }
      : null;
  }

  /** Drafts are deleted, published shifts cancelled. */
  async withdraw(shifts: readonly DatedShift[]): Promise<void> {
    for (const s of shifts) {
      if (s.status === 'draft') await this.shifts.remove(s.id);
      else await this.shifts.cancel(s.id);
    }
  }
}
