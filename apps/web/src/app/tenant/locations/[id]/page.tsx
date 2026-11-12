'use client';

import type { LocationView } from '@xrostr/contracts';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { LocationForm } from '@/components/location-form';
import { Alert, Button, PageHeader, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useData } from '@/lib/use-data';
import type { LegalEntityOption } from '@/lib/workforce';

export default function EditLocationPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { data: entities, error: entitiesError } =
    useData<LegalEntityOption[]>('/tenant/legal-entities');
  const { data: locations, error, reload } = useData<LocationView[]>('/tenant/locations');
  const [statusError, setStatusError] = useState<string | null>(null);
  const location = locations?.find((l) => l.id === id);

  async function toggleArchive() {
    if (!location) return;
    setStatusError(null);
    try {
      await api(`/tenant/locations/${location.id}`, {
        method: 'PATCH',
        body: { status: location.status === 'active' ? 'archived' : 'active' },
      });
      await reload();
    } catch (e) {
      setStatusError(e instanceof ApiError ? e.message : 'Terjadi kesalahan.');
    }
  }

  const failure = error ?? entitiesError ?? statusError;
  return (
    <>
      <PageHeader
        title={location?.name ?? 'Site'}
        description={location ? `Kode ${location.code}` : undefined}
        actions={
          location && (
            <Button variant="secondary" onClick={toggleArchive}>
              {location.status === 'active' ? 'Arsipkan' : 'Aktifkan lagi'}
            </Button>
          )
        }
      />
      {failure && <Alert>{failure}</Alert>}
      {(!locations || !entities) && !failure && <Spinner />}
      {locations && !location && <Alert>Site tidak ditemukan.</Alert>}
      {location && entities && (
        <LocationForm
          key={location.id + location.status}
          entities={entities}
          location={location}
          onSaved={() => router.push('/tenant/locations')}
        />
      )}
    </>
  );
}
