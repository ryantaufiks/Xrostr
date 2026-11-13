'use client';

import type { Locale } from '@xrostr/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { auth, invite } from './messages/auth';
import { attendance } from './messages/attendance';
import { leave } from './messages/leave';
import { patrol } from './messages/patrol';
import { planning } from './messages/planning';
import { safety } from './messages/safety';
import { relief } from './messages/relief';
import { visits } from './messages/visits';
import { common } from './messages/common';
import { errors } from './messages/errors';
import { home } from './messages/home';
import { account } from './messages/account';
import { platform } from './messages/platform';
import { workforce } from './messages/workforce';
import { sites } from './messages/sites';
import { schedule } from './messages/schedule';
import { rememberLocale, setCurrentLocale } from './state';

const NAMESPACES = {
  common,
  auth,
  errors,
  home,
  account,
  platform,
  workforce,
  sites,
  schedule,
  attendance,
  invite,
  leave,
  patrol,
  safety,
  relief,
  visits,
  planning,
};

export type Dictionary = { [K in keyof typeof NAMESPACES]: (typeof NAMESPACES)[K]['id'] };

const dictionaryFor = (locale: Locale): Dictionary =>
  Object.fromEntries(
    Object.entries(NAMESPACES).map(([name, texts]) => [name, texts[locale]]),
  ) as Dictionary;

interface I18n {
  locale: Locale;
  t: Dictionary;
  /** Switches the interface now and remembers it on this device. */
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initial);
  // Keep helpers outside React (error text, dates) in step before children render.
  setCurrentLocale(locale);
  const setLocale = useCallback((next: Locale) => {
    rememberLocale(next);
    setLocaleState(next);
  }, []);
  const value = useMemo(
    () => ({ locale, t: dictionaryFor(locale), setLocale }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const i18n = useContext(I18nContext);
  if (!i18n) throw new Error('useI18n must be used inside I18nProvider');
  return i18n;
}

export const useT = (): Dictionary => useI18n().t;

/**
 * Adopts the signed-in person's language once their session is known. It runs when the session
 * value arrives, not when the shown language changes, so a switch made on the Account page is
 * not undone by the session that was loaded before it.
 */
export function useAdoptLocale(locale: Locale | null | undefined): void {
  const { setLocale } = useI18n();
  useEffect(() => {
    if (locale) setLocale(locale);
  }, [locale, setLocale]);
}
