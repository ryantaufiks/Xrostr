import type { Locale } from '@xrostr/contracts';

const INTL_LOCALE: Record<Locale, string> = { en: 'en-SG', id: 'id-ID' };

/** A YYYY-MM-DD calendar date in the reader's language, e.g. "Monday, 16 November". */
export function formatCalendarDate(
  date: string,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' },
): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}
