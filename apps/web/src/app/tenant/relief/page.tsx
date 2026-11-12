'use client';

import { ReliefOffers } from '@/components/relief-offers';
import { PageHeader } from '@/components/ui';
import { useT } from '@/lib/i18n';

/** Where the "Replacement shift offered" notification leads. */
export default function ReliefPage() {
  const t = useT();
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={t.relief.offersTitle} />
      <ReliefOffers showEmpty />
    </div>
  );
}
