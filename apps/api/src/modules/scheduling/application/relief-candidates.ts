import type { ReliefCandidate, ReliefPriority } from '@xrostr/contracts';
import type { WorkforceEmployee } from '../../workforce/public-api.js';
import { MIN_REST_HOURS } from './scheduling-conflicts.js';
import type { Shift } from './ports.js';

const HOUR_MS = 3_600_000;
const RANK: Record<ReliefPriority, number> = { roving: 0, standby: 1, off_duty: 2 };

export interface ReliefContext {
  siteId: string;
  /** The part of the shift to cover. */
  start: Date;
  end: Date;
  /** Zones that contain the site: their roving officers are nearby. */
  zoneIds: ReadonlySet<string>;
  /** Live (not cancelled) shifts of the employees around the window, any kind. */
  shifts: readonly Shift[];
  /** Employees on approved leave during the window. */
  onLeave: ReadonlySet<string>;
  /** Sites each employee is cleared to guard; absent = any site. */
  allowedSites: ReadonlyMap<string, readonly string[]>;
  /** Monday–Sunday of the window's week, for the weekly-hours warning. */
  weekStart: Date;
  weekEnd: Date;
  weeklyLimit: number;
}

const overlaps = (s: Shift, start: Date, end: Date) => s.startsAt < end && s.endsAt > start;
const hours = (s: Shift) => (s.endsAt.getTime() - s.startsAt.getTime()) / HOUR_MS;

/**
 * Who can take over a shift, in the order to offer it: roving officers on duty in a zone that
 * contains the site, then officers on standby during the window, then off-duty officers who
 * relieve or are based at the site. Excluded: anyone on leave, not cleared for the site, already
 * working then (except the roving officer, who leaves the zone), or left with less than the
 * minimum rest before or after. Within a group, fewer hours this week comes first.
 */
export function rankReliefCandidates(
  employees: readonly WorkforceEmployee[],
  ctx: ReliefContext,
): ReliefCandidate[] {
  const byEmployee = Map.groupBy(ctx.shifts, (s) => s.employeeId);
  const candidates: ReliefCandidate[] = [];

  for (const e of employees) {
    if (e.status !== 'active' || ctx.onLeave.has(e.id)) continue;
    const cleared = ctx.allowedSites.get(e.id) ?? [];
    if (cleared.length > 0 && !cleared.includes(ctx.siteId) && e.locationId !== ctx.siteId)
      continue;

    const theirs = byEmployee.get(e.id) ?? [];
    const working = theirs.filter((s) => s.kind !== 'standby');
    const clashing = working.filter((s) => overlaps(s, ctx.start, ctx.end));

    let priority: ReliefPriority | null = null;
    if (clashing.length > 0) {
      const roving =
        clashing.length === 1 &&
        clashing[0]!.status === 'published' &&
        clashing[0]!.zoneId !== null &&
        ctx.zoneIds.has(clashing[0]!.zoneId);
      if (!roving) continue;
      priority = 'roving';
    } else {
      const restBefore = working
        .filter((s) => s.endsAt <= ctx.start)
        .every((s) => ctx.start.getTime() - s.endsAt.getTime() >= MIN_REST_HOURS * HOUR_MS);
      const restAfter = working
        .filter((s) => s.startsAt >= ctx.end)
        .every((s) => s.startsAt.getTime() - ctx.end.getTime() >= MIN_REST_HOURS * HOUR_MS);
      if (!restBefore || !restAfter) continue;
      if (theirs.some((s) => s.kind === 'standby' && overlaps(s, ctx.start, ctx.end)))
        priority = 'standby';
      else if (e.canRelieve || e.assignmentType === 'roving' || e.locationId === ctx.siteId)
        priority = 'off_duty';
    }
    if (!priority) continue;

    const weeklyHours = working
      .filter((s) => s.startsAt >= ctx.weekStart && s.startsAt < ctx.weekEnd)
      .reduce((n, s) => n + hours(s), 0);
    const added = (ctx.end.getTime() - ctx.start.getTime()) / HOUR_MS;
    candidates.push({
      employee: { id: e.id, fullName: e.fullName, employeeNo: e.employeeNo, phone: e.phone },
      priority,
      weeklyHours: Math.round(weeklyHours * 10) / 10,
      overWeeklyLimit: priority !== 'roving' && weeklyHours + added > ctx.weeklyLimit,
    });
  }

  return candidates.sort(
    (a, b) =>
      RANK[a.priority] - RANK[b.priority] ||
      a.weeklyHours - b.weeklyHours ||
      a.employee.fullName.localeCompare(b.employee.fullName),
  );
}
