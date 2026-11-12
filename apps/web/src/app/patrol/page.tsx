'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { Spinner } from '@/components/ui';
import { useT } from '@/lib/i18n';

/**
 * Target of a checkpoint's QR code or NFC sticker, so the phone's own camera or NFC reader
 * works too. Hands over to the scan page inside the signed-in area (login first if needed).
 */
function Forward() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    router.replace(`/tenant/patrol/scan?${params.toString()}`);
  }, [params, router]);
  return <Spinner label={t.patrol.recording} />;
}

export default function PatrolLink() {
  return (
    <Suspense>
      <Forward />
    </Suspense>
  );
}
