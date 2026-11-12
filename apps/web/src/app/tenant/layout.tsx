'use client';

import type { Permission } from '@xrostr/contracts';
import {
  Building2,
  CalendarDays,
  House,
  Palmtree,
  Route,
  Siren,
  UserRound,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { AppShell, type NavItem } from '@/components/app-shell';
import { NotificationBell } from '@/components/notification-bell';
import { Spinner } from '@/components/ui';
import { PrincipalContext } from '@/lib/principal-context';
import { useAdoptLocale, useT, type Dictionary } from '@/lib/i18n';
import { useSession } from '@/lib/session';

/** Each person sees only the sections their role can use. */
function navFor(permissions: readonly Permission[], nav: Dictionary['home']['nav']): NavItem[] {
  const can = (p: Permission) => permissions.includes(p);
  return [
    { href: '/tenant', label: nav.home, icon: House },
    ...(can('employees.read')
      ? [{ href: '/tenant/employees', label: nav.employees, icon: Users }]
      : []),
    ...(can('schedules.read')
      ? [{ href: '/tenant/roster', label: nav.roster, icon: CalendarDays }]
      : []),
    // Officers patrol; planners and HR monitor. Everyone in a tenant has a reason to be here.
    { href: '/tenant/patrol', label: nav.patrol, icon: Route },
    ...(can('alerts.respond') ? [{ href: '/tenant/alerts', label: nav.alerts, icon: Siren }] : []),
    { href: '/tenant/leave', label: nav.leave, icon: Palmtree },
    ...(can('locations.read')
      ? [{ href: '/tenant/locations', label: nav.sites, icon: Building2 }]
      : []),
    { href: '/tenant/account', label: nav.account, icon: UserRound },
  ];
}

export default function TenantLayout({ children }: { children: ReactNode }) {
  const t = useT();
  const principal = useSession('tenant');
  useAdoptLocale(principal?.locale.locale);
  if (!principal) return <Spinner />;
  return (
    <PrincipalContext.Provider value={principal}>
      <AppShell
        areaLabel={t.home.nav.areaCompany}
        actions={<NotificationBell href="/tenant/notifications" />}
        nav={navFor(principal.permissions, t.home.nav)}
      >
        {children}
      </AppShell>
    </PrincipalContext.Provider>
  );
}
