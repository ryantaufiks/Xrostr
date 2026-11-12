'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { Spinner } from '@/components/ui';

/**
 * Target of the site QR code, so the phone's own camera app works too. Hands over to the
 * check-in page inside the signed-in area, which sends visitors to log in first if needed.
 */
function Forward() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    router.replace(`/tenant/checkin?${params.toString()}`);
  }, [params, router]);
  return <Spinner label="Membuka absensi…" />;
}

export default function CheckinLink() {
  return (
    <Suspense>
      <Forward />
    </Suspense>
  );
}
