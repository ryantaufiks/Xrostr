'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { applyTheme, currentTheme, type Theme } from '@/lib/theme';
import { AccountSection } from './account-section';
import { cx } from './ui';

const OPTIONS: { value: Theme; label: string; Icon: typeof Moon }[] = [
  { value: 'dark', label: 'Gelap', Icon: Moon },
  { value: 'light', label: 'Terang', Icon: Sun },
];

export function ThemeCard() {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => setTheme(currentTheme()), []);

  function choose(next: Theme) {
    applyTheme(next);
    setTheme(next);
  }

  return (
    <AccountSection title="Tampilan" description="Pilihan tema disimpan di perangkat ini.">
      <div
        className="grid max-w-md grid-cols-2 gap-1 rounded-full border border-control p-1"
        role="radiogroup"
        aria-label="Tema"
      >
        {OPTIONS.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            onClick={() => choose(value)}
            className={cx(
              'label inline-flex min-h-11 items-center justify-center gap-2 rounded-full font-bold transition',
              theme === value ? 'bg-fg text-bg' : 'text-muted hover:text-fg',
            )}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </AccountSection>
  );
}
