'use client';

import { SafetyPanel } from '@/components/safety/safety-panel';
import { PageHeader } from '@/components/ui';
import { useT } from '@/lib/i18n';

/** Where the "Are you OK?" notification leads. */
export default function SafetyPage() {
  const t = useT();
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={t.safety.title} />
      <SafetyPanel showEmptyCheck />
    </div>
  );
}
