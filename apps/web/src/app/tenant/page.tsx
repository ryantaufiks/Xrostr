'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, Card, PageHeader, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { MyShifts } from '@/components/my-shifts';
import { usePrincipal } from '@/lib/principal-context';

interface LegalEntity {
  id: string;
  name: string;
  countryCode: string;
  registrationNumber: string | null;
  currency: string;
  defaultTimezone: string;
}

interface AuditRecord {
  id: string;
  actorType: string;
  action: string;
  createdAt: string;
}

export default function TenantHome() {
  const t = useT();
  const principal = usePrincipal();
  const canReadEntities = principal.permissions.includes('entities.read');
  const canReadAudit = principal.permissions.includes('audit.read');

  // Officers have no company-wide data to see; their home is about their own work.
  if (!canReadEntities && !canReadAudit) {
    return (
      <>
        <PageHeader title={t.home.myScheduleTitle} description={t.home.myScheduleGreeting} />
        <MyShifts />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t.home.overviewTitle} description={t.home.overviewSubtitle} />
      <div className="space-y-6">
        {canReadEntities && <LegalEntities />}
        {canReadAudit && <AuditLog />}
      </div>
    </>
  );
}

function useData<T>(path: string) {
  const t = useT();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<T>(path)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : t.common.error));
  }, [path]);
  return { data, error };
}

function LegalEntities() {
  const t = useT();
  const { data, error } = useData<LegalEntity[]>('/tenant/legal-entities');
  return (
    <section>
      <h2 className="label mb-3 text-muted">{t.home.legalEntities}</h2>
      {error && <Alert>{error}</Alert>}
      {!data && !error && <Spinner />}
      {data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((entity) => (
            <Card key={entity.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-lg font-semibold text-fg">{entity.name}</p>
                <Badge>{entity.countryCode}</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-y-2.5 text-base">
                <dt className="text-muted">{t.home.country}</dt>
                <dd className="text-fg">
                  {t.common.countries[entity.countryCode] ?? entity.countryCode}
                </dd>
                <dt className="text-muted">{t.home.currency}</dt>
                <dd className="text-fg">{entity.currency}</dd>
                <dt className="text-muted">{t.home.timezone}</dt>
                <dd className="text-fg">{entity.defaultTimezone}</dd>
                <dt className="text-muted">{t.home.registration}</dt>
                <dd className="text-fg">{entity.registrationNumber ?? '—'}</dd>
              </dl>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function AuditLog() {
  const t = useT();
  const actionLabel = (action: string) => t.home.actions[action] ?? action;
  const actorLabel = (actorType: string) => (actorType === 'user' ? t.home.actorUser : actorType);
  const { data, error } = useData<AuditRecord[]>('/tenant/audit-log?limit=20');
  return (
    <section>
      <h2 className="label mb-3 text-muted">{t.home.recentActivity}</h2>
      {error && <Alert>{error}</Alert>}
      {!data && !error && <Spinner />}
      {data && (
        <Card>
          {/* Phones: a stacked list, so nothing has to be scrolled sideways. */}
          <ul className="divide-y divide-line sm:hidden">
            {data.map((record) => (
              <li key={record.id} className="px-5 py-4">
                <p className="text-base font-semibold text-fg">{actionLabel(record.action)}</p>
                <p className="mt-1 text-sm text-muted">
                  {formatDateTime(record.createdAt)} · {actorLabel(record.actorType)}
                </p>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-left text-base sm:table">
            <thead className="label border-b border-line text-muted">
              <tr>
                <th className="px-5 py-3 font-bold">{t.home.when}</th>
                <th className="px-5 py-3 font-bold">{t.home.activity}</th>
                <th className="px-5 py-3 font-bold">{t.home.actor}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((record) => (
                <tr key={record.id}>
                  <td className="px-5 py-3.5 whitespace-nowrap text-muted">
                    {formatDateTime(record.createdAt)}
                  </td>
                  <td className="px-5 py-3.5 text-fg">{actionLabel(record.action)}</td>
                  <td className="px-5 py-3.5 text-muted">{actorLabel(record.actorType)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
