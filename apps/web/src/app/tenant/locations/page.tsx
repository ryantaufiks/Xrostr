'use client';

import type { LocationView } from '@xrostr/contracts';
import { Building2, MapPin, Plus } from 'lucide-react';
import Link from 'next/link';
import { Alert, Badge, Card, PageHeader, Spinner, buttonStyles } from '@/components/ui';
import { usePrincipal } from '@/lib/principal-context';
import { useData } from '@/lib/use-data';
import { TIMEZONE_LABELS } from '@/lib/workforce';
import { useT } from '@/lib/i18n';

export default function LocationsPage() {
  const t = useT();
  const { permissions } = usePrincipal();
  const canManage = permissions.includes('locations.manage');
  const { data, error } = useData<LocationView[]>('/tenant/locations');

  return (
    <>
      <PageHeader
        title={t.sites.title}
        description={t.sites.subtitle}
        actions={
          canManage && (
            <Link href="/tenant/locations/new" className={buttonStyles('primary')}>
              <Plus className="size-5" aria-hidden />
              {t.sites.add}
            </Link>
          )
        }
      />
      {error && <Alert>{error}</Alert>}
      {!data && !error && <Spinner />}
      {data?.length === 0 && (
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <Building2 className="size-10 text-faint" aria-hidden />
          <h2 className="mt-4 font-display text-xl font-bold">{t.sites.empty}</h2>
          <p className="mt-1 max-w-sm text-base text-muted">{t.sites.emptyHint}</p>
        </Card>
      )}
      {data && data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((site) => {
            const card = (
              <Card className="h-full p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-fg">{site.name}</p>
                    <p className="font-mono text-sm text-muted">{site.code}</p>
                  </div>
                  <Badge tone={site.status === 'active' ? 'active' : 'neutral'}>
                    {site.status === 'active' ? t.sites.active : t.sites.archived}
                  </Badge>
                </div>
                <dl className="mt-4 space-y-1.5 text-base">
                  <div className="flex gap-2 text-muted">
                    <MapPin className="mt-1 size-4 shrink-0" aria-hidden />
                    <span>
                      {site.latitude != null
                        ? t.sites.radius(site.geofenceRadiusM)
                        : t.sites.noPoint}
                    </span>
                  </div>
                  <p className="text-muted">{TIMEZONE_LABELS[site.timezone] ?? site.timezone}</p>
                  <p className="text-muted">{site.legalEntity.name}</p>
                </dl>
              </Card>
            );
            return canManage ? (
              <Link
                key={site.id}
                href={`/tenant/locations/${site.id}`}
                className="block hover:opacity-90"
              >
                {card}
              </Link>
            ) : (
              <div key={site.id}>{card}</div>
            );
          })}
        </div>
      )}
    </>
  );
}
