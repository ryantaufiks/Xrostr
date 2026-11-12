'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { applyTheme, currentTheme, type Theme } from '@/lib/theme';
import { AccountSection } from './account-section';
import { SegmentedControl, segmentedOptionStyles } from './ui';

export function ThemeCard() {
  const t = useT();
  const options: { value: Theme; label: string; Icon: typeof Moon }[] = [
    { value: 'dark', label: t.account.dark, Icon: Moon },
    { value: 'light', label: t.account.light, Icon: Sun },
  ];
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => setTheme(currentTheme()), []);

  function choose(next: Theme) {
    applyTheme(next);
    setTheme(next);
  }

  return (
    <AccountSection title={t.account.themeTitle} description={t.account.themeDescription}>
      <SegmentedControl
        className="grid max-w-md grid-cols-2"
        role="radiogroup"
        aria-label={t.account.theme}
      >
        {options.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            onClick={() => choose(value)}
            className={segmentedOptionStyles(theme === value)}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </button>
        ))}
      </SegmentedControl>
    </AccountSection>
  );
}
