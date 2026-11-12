/**
 * Leave arithmetic on YYYY-MM-DD dates. Security staff work any day of the week, so a leave
 * day is any calendar day that is not a public holiday of the employee's country.
 */

const toUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const DAY = 86_400_000;

export function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  for (let t = toUtc(start); t <= toUtc(end); t += DAY)
    days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}

export const spanDays = (start: string, end: string) => (toUtc(end) - toUtc(start)) / DAY + 1;

export function chargeableDays(start: string, end: string, holidays: ReadonlySet<string>): number {
  return eachDay(start, end).filter((d) => !holidays.has(d)).length;
}

/** Whole months from `since` to `on`, counting a month only once its day is reached. */
export function completedMonths(since: string, on: string): number {
  const [y1, m1, d1] = since.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = on.split('-').map(Number) as [number, number, number];
  const months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return Math.max(0, months);
}

export const completedYears = (since: string, on: string) =>
  Math.floor(completedMonths(since, on) / 12);
