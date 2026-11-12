'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { Spinner } from '@/components/ui';
import { PrincipalContext } from '@/lib/principal-context';
import { useSession } from '@/lib/session';

export default function TenantLayout({ children }: { children: ReactNode }) {
  const principal = useSession('tenant');
  if (!principal) return <Spinner />;
  return (
    <PrincipalContext.Provider value={principal}>
      <AppShell areaLabel="Perusahaan" nav={[{ href: '/tenant', label: 'Ringkasan' }]}>
        {children}
      </AppShell>
    </PrincipalContext.Provider>
  );
}
