import type { ShiftKind, ShiftView } from '@xrostr/contracts';
import { schedule } from './i18n/messages/schedule';
import { currentLocale, intlLocale } from './i18n/state';

const texts = () => schedule[currentLocale()];

export const shiftKindLabel = (kind: ShiftKind) => texts().kinds[kind] ?? kind;

/** One-letter marker for a grid cell: P / M / K. */
export const shiftKindShort = (kind: ShiftKind): string => {
  const s = texts();
  return kind === 'day' ? s.shortDay : kind === 'night' ? s.shortNight : s.shortCustom;
};

/** Indonesian writes times as 20.00, English as 20:00. */
const clock = (hhmm: string) => (currentLocale() === 'id' ? hhmm.replace(':', '.') : hhmm);

/** "20.00–08.00" (Indonesian) or "20:00–08:00" (English). */
export const shiftHours = (s: Pick<ShiftView, 'localStart' | 'localEnd'>) =>
  `${clock(s.localStart)}–${clock(s.localEnd)}`;

const HOUR = 3_600_000;

/** Same window the server uses: opens 2 h before the start, closes 4 h after the end. */
export function attendanceOpen(
  s: Pick<ShiftView, 'startsAt' | 'endsAt'>,
  now = Date.now(),
): boolean {
  return now >= Date.parse(s.startsAt) - 2 * HOUR && now < Date.parse(s.endsAt) + 4 * HOUR;
}

/** Clock time at the site, not on the phone, e.g. 19.58 (Indonesian) or 19:58 (English). */
export const localClock = (iso: string, timeZone: string) =>
  clock(
    new Intl.DateTimeFormat(intlLocale(), {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .format(new Date(iso))
      .replace('.', ':'),
  );

/** "In 19:58 · 12 min late · Out 08:03" in the site's time zone; null if nothing yet. */
export function attendanceSummary(s: ShiftView): { text: string; late: boolean } | null {
  const a = s.attendance;
  if (!a?.checkInAt) return null;
  const t = texts();
  const parts = [t.checkedIn(localClock(a.checkInAt, s.timezone))];
  if (a.lateMinutes) parts.push(t.late(a.lateMinutes));
  if (a.checkOutAt) parts.push(t.checkedOut(localClock(a.checkOutAt, s.timezone)));
  return { text: parts.join(' · '), late: !!a.lateMinutes };
}
