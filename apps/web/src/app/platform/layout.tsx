'use client';

import { Building2, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { Spinner } from '@/components/ui';
import { useSession } from '@/lib/session';

export default function PlatformLayout({ children }: { children: ReactNode }) {
  const principal = useSession('platform');
  if (!principal) return <Spinner />;
  return (
    <AppShell
      areaLabel="Superadmin"
      nav={[
        { href: '/platform/tenants', label: 'Tenant', icon: Building2 },
        { href: '/platform/account', label: 'Akun', icon: UserRound },
      ]}
    >
      {children}
    </AppShell>
  );
}
