'use client';

import { LOCALES, type Locale } from '@xrostr/contracts';
import { useI18n } from '@/lib/i18n';
import { cx, SegmentedControl, segmentedOptionStyles } from './ui';

const SHORT: Record<Locale, string> = { id: 'ID', en: 'EN' };
const NAMES: Record<Locale, string> = { id: 'Bahasa Indonesia', en: 'English' };

/** Compact ID | EN toggle for pages before sign-in; the choice is remembered on this device. */
export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <SegmentedControl
      role="radiogroup"
      aria-label={t.common.language}
      className={cx('inline-flex', className)}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={locale === l}
          aria-label={NAMES[l]}
          onClick={() => setLocale(l)}
          className={segmentedOptionStyles(locale === l, 'sm')}
        >
          {SHORT[l]}
        </button>
      ))}
    </SegmentedControl>
  );
}
