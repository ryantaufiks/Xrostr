'use client';

import { useRouter } from 'next/navigation';
import { LocationForm } from '@/components/location-form';
import { Alert, PageHeader, Spinner } from '@/components/ui';
import { useData } from '@/lib/use-data';
import type { LegalEntityOption } from '@/lib/workforce';
import { useT } from '@/lib/i18n';

export default function NewLocationPage() {
  const t = useT();
  const router = useRouter();
  const { data: entities, error } = useData<LegalEntityOption[]>('/tenant/legal-entities');
  return (
    <>
      <PageHeader title={t.sites.add} description={t.sites.newSubtitle} />
      {error && <Alert>{error}</Alert>}
      {!entities && !error && <Spinner />}
      {entities && (
        <LocationForm entities={entities} onSaved={() => router.push('/tenant/locations')} />
      )}
    </>
  );
}
