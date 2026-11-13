import {
  SHIFT_PRESETS,
  type RosterSuggestion,
  type RosterSuggestionsView,
} from '@xrostr/contracts';
import { addDays, localToUtc, utcToLocal } from '../../../shared/domain/local-time.js';
import type { WorkforceEmployee } from '../../workforce/public-api.js';
import type { LeaveSpan, Shift, StaffingRow } from './ports.js';
import { MAX_CONSECUTIVE_NIGHTS, MIN_REST_HOURS } from './scheduling-conflicts.js';

const HOUR_MS = 3_600_000;
const KINDS = ['day', 'night'] as const;

export interface SuggestionContext {
  siteId: string;
  timezone: string;
  /** Local dates to fill, in order. */
  days: readonly string[];
  requirements: readonly StaffingRow[];
  /** Live shifts (any site, any kind) of the candidates, with a week of slack either side. */
  shifts: readonly Shift[];
  leaves: readonly LeaveSpan[];
  /** Sites each employee is cleared to guard; absent or empty = any site. */
  allowedSites: ReadonlyMap<string, readonly string[]>;
  weeklyLimit: number;
}

/** A shift being planned: an existing one or one suggested earlier in this run. */
interface Slot {
  employeeId: string;
  kind: string;
  locationId: string | null;
  startsAt: Date;
  endsAt: Date;
  localDate: string;
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
const weekdayOf = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};
const mondayOf = (date: string) => addDays(date, 1 - weekdayOf(date));
const hoursOf = (s: Slot) => (s.endsAt.getTime() - s.startsAt.getTime()) / HOUR_MS;

/**
 * Suggests officers for the day and night shifts a site is short of, day by day, without
 * breaking a roster rule: nobody on leave, not cleared for the site, already working then, short
 * of the minimum rest, over the weekly hours limit, or about to reach the consecutive-nights
 * warning. Roving officers are left to their zones. Officers based at the site come first, then
 * whoever has fewer hours that week. Each suggestion counts for the next ones, so the result can
 * be applied as a whole.
 */
export function suggestFill(
  employees: readonly WorkforceEmployee[],
  ctx: SuggestionContext,
): RosterSuggestionsView {
  const slots: Slot[] = ctx.shifts
    .filter((s) => s.status !== 'cancelled' && s.kind !== 'standby')
    .map((s) => ({
      employeeId: s.employeeId,
      kind: s.kind,
      locationId: s.locationId,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      localDate: utcToLocal(s.startsAt, ctx.timezone).date,
    }));
  const onLeave = new Map<string, Set<string>>();
  for (const span of ctx.leaves) {
    const set = onLeave.get(span.employeeId) ?? new Set<string>();
    for (let d = span.startDate; d <= span.endDate; d = addDays(d, 1)) set.add(d);
    onLeave.set(span.employeeId, set);
  }
  const pool = employees.filter((e) => {
    if (e.status !== 'active' || e.assignmentType === 'roving') return false;
    const cleared = ctx.allowedSites.get(e.id) ?? [];
    return e.locationId === ctx.siteId || cleared.length === 0 || cleared.includes(ctx.siteId);
  });

  const suggestions: RosterSuggestion[] = [];
  const unfilled: RosterSuggestionsView['unfilled'] = [];

  for (const date of ctx.days) {
    const requirement = ctx.requirements.find((r) => r.weekday === weekdayOf(date));
    if (!requirement) continue;
    for (const kind of KINDS) {
      const wanted = kind === 'day' ? requirement.dayCount : requirement.nightCount;
      const have = slots.filter(
        (s) => s.locationId === ctx.siteId && s.localDate === date && s.kind === kind,
      ).length;
      const preset = SHIFT_PRESETS[kind];
      const startsAt = localToUtc(date, preset.start, ctx.timezone);
      const endsAt = new Date(startsAt.getTime() + preset.hours * HOUR_MS);
      const week = mondayOf(date);

      let missing = Math.max(0, wanted - have);
      while (missing > 0) {
        const ranked = pool
          .flatMap((e) => {
            const theirs = slots.filter((s) => s.employeeId === e.id);
            if (!fits(e.id, theirs, startsAt, endsAt, date, kind, onLeave)) return [];
            const weekly = theirs
              .filter((s) => mondayOf(s.localDate) === week)
              .reduce((n, s) => n + hoursOf(s), 0);
            if (weekly + preset.hours > ctx.weeklyLimit) return [];
            return [{ e, weekly, home: e.locationId === ctx.siteId }];
          })
          .sort(
            (a, b) =>
              Number(b.home) - Number(a.home) ||
              a.weekly - b.weekly ||
              a.e.fullName.localeCompare(b.e.fullName),
          );
        const best = ranked[0];
        if (!best) break;
        slots.push({
          employeeId: best.e.id,
          kind,
          locationId: ctx.siteId,
          startsAt,
          endsAt,
          localDate: date,
        });
        suggestions.push({
          date,
          kind,
          employee: {
            id: best.e.id,
            fullName: best.e.fullName,
            employeeNo: best.e.employeeNo,
          },
          homeSite: best.home,
          weeklyHours: best.weekly + preset.hours,
        });
        missing--;
      }
      if (missing > 0) unfilled.push({ date, kind, missing });
    }
  }
  return { suggestions, unfilled };
}

function fits(
  employeeId: string,
  theirs: readonly Slot[],
  start: Date,
  end: Date,
  date: string,
  kind: 'day' | 'night',
  onLeave: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  if (onLeave.get(employeeId)?.has(date)) return false;
  const rest = MIN_REST_HOURS * HOUR_MS;
  for (const s of theirs) {
    if (s.startsAt < end && s.endsAt > start) return false;
    if (s.endsAt <= start && start.getTime() - s.endsAt.getTime() < rest) return false;
    if (s.startsAt >= end && s.startsAt.getTime() - end.getTime() < rest) return false;
  }
  if (kind === 'night') {
    // Stop before the run of nights reaches the roster's warning threshold.
    const nights = new Set(theirs.filter((s) => s.kind === 'night').map((s) => s.localDate));
    let run = 1;
    for (let d = addDays(date, -1); nights.has(d); d = addDays(d, -1)) run++;
    for (let d = addDays(date, 1); nights.has(d); d = addDays(d, 1)) run++;
    if (run >= MAX_CONSECUTIVE_NIGHTS) return false;
  }
  return true;
}
