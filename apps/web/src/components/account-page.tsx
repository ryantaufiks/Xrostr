'use client';

import { AppCard } from './app-card';
import { ChangePasswordCard } from './change-password-form';
import { LanguageCard } from './language-card';
import { useT } from '@/lib/i18n';
import { ThemeCard } from './theme-card';
import { PageHeader } from './ui';

/** Account page shared by the platform and tenant areas. */
export function AccountPage({ area }: { area: 'platform' | 'tenant' }) {
  const t = useT();
  return (
    <>
      <PageHeader title={t.account.title} description={t.account.subtitle} />
      <div className={area === 'platform' ? 'account-widgets' : 'space-y-6'}>
        <LanguageCard area={area} />
        {area === 'tenant' && <AppCard />}
        <ThemeCard />
        <ChangePasswordCard />
      </div>
    </>
  );
}
