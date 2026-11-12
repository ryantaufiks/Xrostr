'use client';

import { Building2, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { Spinner } from '@/components/ui';
import { useAdoptLocale, useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';

export default function PlatformLayout({ children }: { children: ReactNode }) {
  const t = useT();
  const principal = useSession('platform');
  // No company sets a default for the Superadmin: without a personal choice, keep this device's.
  useAdoptLocale(principal?.locale.preferred);
  if (!principal) return <Spinner />;
  return (
    <AppShell
      areaLabel={t.home.nav.areaPlatform}
      nav={[
        { href: '/platform/tenants', label: t.home.nav.tenants, icon: Building2 },
        { href: '/platform/account', label: t.home.nav.account, icon: UserRound },
      ]}
    >
      {children}
    </AppShell>
  );
}
