'use client';

import type { Permission, SessionStage } from '@xrostr/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { releasePush } from './pwa';

export interface Principal {
  subject: { type: 'platform_admin' | 'user'; id: string; tenantId: string | null };
  sessionId: string;
  stage: SessionStage;
  permissions: Permission[];
}

export type Area = 'platform' | 'tenant';

/** Where a signed-in principal belongs. */
export function homeFor(principal: Principal): string {
  if (principal.stage === 'mfa_setup') return '/mfa-setup';
  return principal.subject.type === 'platform_admin' ? '/platform/tenants' : '/tenant';
}

export function fetchPrincipal(): Promise<Principal> {
  return api<Principal>('/auth/me');
}

/**
 * Loads the session for a protected area. Sends the visitor to /login when signed out,
 * and to their own area when the page belongs to another.
 */
export function useSession(area: Area): Principal | null {
  const router = useRouter();
  const [principal, setPrincipal] = useState<Principal | null>(null);

  useEffect(() => {
    let active = true;
    fetchPrincipal()
      .then((p) => {
        if (!active) return;
        const home = homeFor(p);
        const belongs = area === 'platform' ? home === '/platform/tenants' : home === '/tenant';
        if (belongs) setPrincipal(p);
        else router.replace(home);
      })
      .catch((error: unknown) => {
        if (active && error instanceof ApiError && error.status === 401) router.replace('/login');
      });
    return () => {
      active = false;
    };
  }, [area, router]);

  return principal;
}

export async function logout(): Promise<void> {
  await releasePush();
  await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
}
