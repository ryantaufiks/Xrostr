'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui';
import { fetchPrincipal, homeFor } from '@/lib/session';

/** Sends visitors to their area, or to sign-in. */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    fetchPrincipal()
      .then((principal) => router.replace(homeFor(principal)))
      .catch(() => router.replace('/login'));
  }, [router]);

  return <Spinner />;
}
