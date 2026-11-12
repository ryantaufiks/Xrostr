'use client';

import type { Permission } from '@xrostr/contracts';
import { Building2, CalendarDays, House, Palmtree, UserRound, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { AppShell, type NavItem } from '@/components/app-shell';
import { NotificationBell } from '@/components/notification-bell';
import { Spinner } from '@/components/ui';
import { PrincipalContext } from '@/lib/principal-context';
import { useSession } from '@/lib/session';

/** Each person sees only the sections their role can use. */
function navFor(permissions: readonly Permission[]): NavItem[] {
  const can = (p: Permission) => permissions.includes(p);
  return [
    { href: '/tenant', label: 'Beranda', icon: House },
    ...(can('employees.read')
      ? [{ href: '/tenant/employees', label: 'Karyawan', icon: Users }]
      : []),
    ...(can('schedules.read')
      ? [{ href: '/tenant/roster', label: 'Jadwal', icon: CalendarDays }]
      : []),
    { href: '/tenant/leave', label: 'Cuti', icon: Palmtree },
    ...(can('locations.read')
      ? [{ href: '/tenant/locations', label: 'Site', icon: Building2 }]
      : []),
    { href: '/tenant/account', label: 'Akun', icon: UserRound },
  ];
}

export default function TenantLayout({ children }: { children: ReactNode }) {
  const principal = useSession('tenant');
  if (!principal) return <Spinner />;
  return (
    <PrincipalContext.Provider value={principal}>
      <AppShell
        areaLabel="Perusahaan"
        actions={<NotificationBell href="/tenant/notifications" />}
        nav={navFor(principal.permissions)}
      >
        {children}
      </AppShell>
    </PrincipalContext.Provider>
  );
}
