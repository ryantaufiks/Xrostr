/**
 * Wall-clock time at a site ⇄ UTC instants, using the IANA zone database built into the
 * runtime. Works for zones with daylight saving too, though SG and ID have none.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function wallClock(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Minutes the zone is ahead of UTC at that instant (Jakarta: +420). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** `2026-11-12`, `20:00` in Asia/Jakarta → 2026-11-12T13:00:00Z. */
export function localToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const first = wall - offsetMinutes(new Date(wall), timeZone) * 60_000;
  // Re-check at the result: matters only on the day the offset changes.
  const second = wall - offsetMinutes(new Date(first), timeZone) * 60_000;
  return new Date(second);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** UTC instant → the site's local date (YYYY-MM-DD) and time (HH:MM). */
export function utcToLocal(instant: Date, timeZone: string): { date: string; time: string } {
  const w = wallClock(instant, timeZone);
  return {
    date: `${w.year}-${pad(w.month)}-${pad(w.day)}`,
    time: `${pad(w.hour)}:${pad(w.minute)}`,
  };
}

/** Calendar arithmetic on YYYY-MM-DD strings. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The UTC window covering local days `from`..`to` (inclusive) at a site. */
export function localDaysToUtcRange(
  from: string,
  to: string,
  timeZone: string,
): { start: Date; end: Date } {
  return {
    start: localToUtc(from, '00:00', timeZone),
    end: localToUtc(addDays(to, 1), '00:00', timeZone),
  };
}
