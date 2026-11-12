'use client';

import { createContext, useContext } from 'react';
import type { Principal } from './session';

export const PrincipalContext = createContext<Principal | null>(null);

/** The signed-in principal inside a protected area layout. */
export function usePrincipal(): Principal {
  const principal = useContext(PrincipalContext);
  if (!principal) throw new Error('usePrincipal must be used inside a protected area');
  return principal;
}
