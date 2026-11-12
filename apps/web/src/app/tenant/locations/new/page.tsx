'use client';

import { useRouter } from 'next/navigation';
import { LocationForm } from '@/components/location-form';
import { Alert, PageHeader, Spinner } from '@/components/ui';
import { useData } from '@/lib/use-data';
import type { LegalEntityOption } from '@/lib/workforce';

export default function NewLocationPage() {
  const router = useRouter();
  const { data: entities, error } = useData<LegalEntityOption[]>('/tenant/legal-entities');
  return (
    <>
      <PageHeader title="Tambah site" description="Lokasi kerja baru untuk penugasan officer." />
      {error && <Alert>{error}</Alert>}
      {!entities && !error && <Spinner />}
      {entities && (
        <LocationForm entities={entities} onSaved={() => router.push('/tenant/locations')} />
      )}
    </>
  );
}
