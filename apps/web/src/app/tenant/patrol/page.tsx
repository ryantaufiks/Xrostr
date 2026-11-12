'use client';

import type { LocationView } from '@xrostr/contracts';
import { useEffect, useMemo, useState } from 'react';
import { MyPatrolSection } from '@/components/patrol/my-patrol';
import { PatrolRounds } from '@/components/patrol/patrol-rounds';
import { PatrolRoutes } from '@/components/patrol/patrol-routes';
import { Field, PageHeader, Select } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { usePrincipal } from '@/lib/principal-context';
import { useData } from '@/lib/use-data';

const SITE_KEY = 'xr-patrol-site';

export default function PatrolPage() {
  const t = useT();
  const { permissions } = usePrincipal();
  const canRead = permissions.includes('patrols.read') && permissions.includes('locations.read');
  const canManage = permissions.includes('patrols.manage');
  const sites = useData<LocationView[]>(canRead ? '/tenant/locations' : null);
  const active = useMemo(
    () => sites.data?.filter((s) => s.status === 'active') ?? [],
    [sites.data],
  );
  const [siteId, setSiteId] = useState<string | null>(null);

  useEffect(() => {
    if (siteId || active.length === 0) return;
    let remembered: string | null = null;
    try {
      remembered = localStorage.getItem(SITE_KEY);
    } catch {
      // Storage blocked: start from the first site.
    }
    setSiteId(active.some((s) => s.id === remembered) ? remembered : active[0]!.id);
  }, [active, siteId]);

  function chooseSite(id: string) {
    setSiteId(id);
    try {
      localStorage.setItem(SITE_KEY, id);
    } catch {
      // Not remembered; harmless.
    }
  }

  const site = active.find((s) => s.id === siteId);
  return (
    <>
      <PageHeader title={t.patrol.title} description={canRead ? t.patrol.subtitle : undefined} />
      <div className="space-y-12">
        <MyPatrolSection />
        {canRead && active.length > 0 && (
          <div className="space-y-10">
            <Field label={t.patrol.site} htmlFor="patrol-site">
              <Select
                id="patrol-site"
                value={siteId ?? ''}
                onChange={(e) => chooseSite(e.target.value)}
              >
                {active.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </Select>
            </Field>
            {site && <PatrolRounds key={`rounds-${site.id}`} site={site} />}
            {site && canManage && <PatrolRoutes key={`routes-${site.id}`} site={site} />}
          </div>
        )}
      </div>
    </>
  );
}
