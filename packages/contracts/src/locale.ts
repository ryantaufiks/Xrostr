import { z } from 'zod';
import type { DataRegion } from './country.js';

export const LOCALES = ['en', 'id'] as const;
export type Locale = (typeof LOCALES)[number];

/** A tenant's default language follows its data region: Singapore English, Indonesia Bahasa. */
export function localeForRegion(region: DataRegion | string | null | undefined): Locale {
  return region === 'id' ? 'id' : 'en';
}

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

/** Null clears the personal choice, so the tenant default applies again. */
export const setLocaleSchema = z.object({ locale: z.enum(LOCALES).nullable() });
export type SetLocaleRequest = z.infer<typeof setLocaleSchema>;

/** Text written once per language; the reader's language picks one. */
export type Localized<T> = Record<Locale, T>;

/** The caller's language: their own choice, else their tenant's default. */
export interface LocaleSettings {
  locale: Locale;
  /** Null when following the default. */
  preferred: Locale | null;
  default: Locale;
}
