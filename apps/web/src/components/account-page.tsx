'use client';

import { AppCard } from './app-card';
import { ChangePasswordCard } from './change-password-form';
import { ThemeCard } from './theme-card';
import { PageHeader } from './ui';

/** Account page shared by the platform and tenant areas. */
export function AccountPage({ area }: { area: 'platform' | 'tenant' }) {
  return (
    <>
      <PageHeader title="Akun" description="Tampilan, notifikasi, dan keamanan akun Anda." />
      <div className="space-y-6">
        {area === 'tenant' && <AppCard />}
        <ThemeCard />
        <ChangePasswordCard />
      </div>
    </>
  );
}
