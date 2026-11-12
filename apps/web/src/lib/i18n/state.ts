import type { Locale } from '@xrostr/contracts';
import { z } from 'zod';

export const LOCALE_COOKIE = 'xr_locale';
const INTL: Record<Locale, string> = { id: 'id-ID', en: 'en-SG' };

let current: Locale = 'id';

/**
 * The active language for code outside React (API error text, date formatting). The provider
 * keeps it in step with what is rendered.
 */
export const currentLocale = (): Locale => current;
export const intlLocale = (locale: Locale = current) => INTL[locale];

export function setCurrentLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  // Shared contract schemas validate in the browser too; their messages follow the language.
  z.config(locale === 'id' ? z.locales.id() : z.locales.en());
}
z.config(z.locales.id());

/** Remembers the choice for the next visit, including the sign-in page; read by the server. */
export function rememberLocale(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = locale;
}
