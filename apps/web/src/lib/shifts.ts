import type { ShiftKind, ShiftView } from '@xrostr/contracts';

export const SHIFT_LABELS: Record<ShiftKind, string> = {
  day: 'Shift pagi',
  night: 'Shift malam',
  custom: 'Shift khusus',
};

/** "20.00–08.00" in Indonesian notation. */
export const shiftHours = (s: Pick<ShiftView, 'localStart' | 'localEnd'>) =>
  `${s.localStart.replace(':', '.')}–${s.localEnd.replace(':', '.')}`;

const HOUR = 3_600_000;

/** Same window the server uses: opens 2 h before the start, closes 4 h after the end. */
export function attendanceOpen(
  s: Pick<ShiftView, 'startsAt' | 'endsAt'>,
  now = Date.now(),
): boolean {
  return now >= Date.parse(s.startsAt) - 2 * HOUR && now < Date.parse(s.endsAt) + 4 * HOUR;
}

const localClock = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(iso))
    .replace(':', '.');

/** "Masuk 19.58 · terlambat 12 mnt · Pulang 08.03" in the site's time zone; null if nothing yet. */
export function attendanceSummary(s: ShiftView): { text: string; late: boolean } | null {
  const a = s.attendance;
  if (!a?.checkInAt) return null;
  const parts = [`Masuk ${localClock(a.checkInAt, s.timezone)}`];
  if (a.lateMinutes) parts.push(`terlambat ${a.lateMinutes} mnt`);
  if (a.checkOutAt) parts.push(`Pulang ${localClock(a.checkOutAt, s.timezone)}`);
  return { text: parts.join(' · '), late: !!a.lateMinutes };
}
