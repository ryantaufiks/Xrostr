'use client';

import type { Locale, LocaleSettings } from '@xrostr/contracts';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { AccountSection } from './account-section';
import { Alert, selectableRowStyles } from './ui';

const NAMES: Record<Locale, string> = { id: 'Bahasa Indonesia', en: 'English' };

/** Personal language, saved to the account so notifications follow it too. */
export function LanguageCard({ area }: { area: 'platform' | 'tenant' }) {
  const { t, setLocale } = useI18n();
  const [settings, setSettings] = useState<LocaleSettings | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    api<{ locale: LocaleSettings }>('/auth/me')
      .then((me) => setSettings(me.locale))
      .catch(() => undefined);
  }, []);

  async function choose(preferred: Locale | null) {
    setMessage(null);
    try {
      const saved = await api<LocaleSettings>('/auth/me/locale', {
        method: 'PUT',
        body: { locale: preferred },
      });
      setSettings(saved);
      // The Superadmin has no company default; "follow" keeps this device's language.
      if (area === 'tenant' || saved.preferred) setLocale(saved.locale);
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof ApiError ? e.message : t.common.error });
    }
  }

  const options: { value: Locale | null; label: string }[] = settings
    ? [
        {
          value: null,
          label:
            area === 'tenant'
              ? t.account.followDefault(NAMES[settings.default])
              : t.account.followDevice,
        },
        { value: 'en', label: NAMES.en },
        { value: 'id', label: NAMES.id },
      ]
    : [];

  return (
    <AccountSection title={t.account.languageTitle} description={t.account.languageDescription}>
      <div className="max-w-md space-y-3" role="radiogroup" aria-label={t.account.languageTitle}>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        {options.map(({ value, label }) => {
          const checked = settings?.preferred === value;
          return (
            <button
              key={value ?? 'default'}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => choose(value)}
              className={selectableRowStyles(checked)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </AccountSection>
  );
}
