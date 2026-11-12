/** Calendar helpers on YYYY-MM-DD strings (no time zone involved). */

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Monday of the week containing `date`. */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

const longDay = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const shortDay = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);

/** "Senin, 16 November" */
export const dayLabel = (date: string) => {
  const label = longDay.format(asUtc(date));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/** "16 Nov – 22 Nov" */
export const weekLabel = (monday: string) =>
  `${shortDay.format(asUtc(monday))} – ${shortDay.format(asUtc(addDays(monday, 6)))}`;
