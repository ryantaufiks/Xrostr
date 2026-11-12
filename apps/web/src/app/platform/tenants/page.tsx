'use client';

import type { TenantSummary } from '@xrostr/contracts';
import { Building2, ChevronRight, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Badge, Card, PageHeader, Spinner, buttonStyles } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDate, PLAN_LABELS } from '@/lib/format';
import { useT } from '@/lib/i18n';

export default function TenantsPage() {
  const t = useT();
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<TenantSummary[]>('/platform/tenants')
      .then(setTenants)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : t.common.error));
  }, []);

  return (
    <>
      <PageHeader
        title={t.platform.tenantsTitle}
        description={t.platform.tenantsSubtitle}
        actions={
          <Link href="/platform/tenants/new" className={buttonStyles('primary')}>
            <Plus className="size-4" aria-hidden />
            {t.platform.createTenant}
          </Link>
        }
      />
      {error && <Alert>{error}</Alert>}
      {!tenants && !error && <Spinner />}
      {tenants?.length === 0 && (
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <Building2 className="size-10 text-faint" aria-hidden />
          <h2 className="mt-4 font-display text-xl font-bold">{t.platform.noTenants}</h2>
          <p className="mt-1 max-w-sm text-sm text-muted">{t.platform.noTenantsHint}</p>
          <Link href="/platform/tenants/new" className={buttonStyles('primary', 'mt-6')}>
            {t.platform.createTenant}
          </Link>
        </Card>
      )}
      {tenants && tenants.length > 0 && (
        <ul className="space-y-3 sm:hidden">
          {tenants.map((tenant) => (
            <li key={tenant.id}>
              <Link href={`/platform/tenants/${tenant.id}`} className="block">
                <Card className="flex items-center gap-4 p-5 hover:bg-sunken">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-lg font-semibold text-fg">{tenant.name}</p>
                    <p className="font-mono text-sm text-muted">{tenant.slug}</p>
                    <p className="text-base text-muted">
                      {t.common.regions[tenant.dataRegion] ?? tenant.dataRegion} ·{' '}
                      {PLAN_LABELS[tenant.plan] ?? tenant.plan}
                    </p>
                    <Badge tone={tenant.status === 'active' ? 'active' : 'warn'}>
                      {tenant.status === 'active' ? t.platform.active : t.platform.suspended}
                    </Badge>
                  </div>
                  <ChevronRight
                    className="size-6 shrink-0 text-muted"
                    aria-label={t.platform.manage}
                  />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {tenants && tenants.length > 0 && (
        <Card className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line label text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">{t.platform.name}</th>
                <th className="px-5 py-3 font-medium">{t.platform.slug}</th>
                <th className="px-5 py-3 font-medium">{t.platform.dataRegion}</th>
                <th className="px-5 py-3 font-medium">{t.platform.plan}</th>
                <th className="px-5 py-3 font-medium">{t.platform.status}</th>
                <th className="px-5 py-3 font-medium">{t.platform.created}</th>
                <th className="px-5 py-3 font-medium">
                  <span className="sr-only">{t.platform.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-sunken">
                  <td className="px-5 py-3.5 font-medium text-fg">
                    <Link
                      href={`/platform/tenants/${tenant.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {tenant.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-muted">{tenant.slug}</td>
                  <td className="px-5 py-3.5 text-muted">
                    {t.common.regions[tenant.dataRegion] ?? tenant.dataRegion}
                  </td>
                  <td className="px-5 py-3.5 text-muted">
                    {PLAN_LABELS[tenant.plan] ?? tenant.plan}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={tenant.status === 'active' ? 'active' : 'warn'}>
                      {tenant.status === 'active' ? t.platform.active : t.platform.suspended}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-muted">{formatDate(tenant.createdAt)}</td>
                  <td className="px-5 py-3.5 text-right">
                    {/* Icon only; the label slides in on hover or keyboard focus. */}
                    <Link
                      href={`/platform/tenants/${tenant.id}`}
                      aria-label={t.platform.manageTenant(tenant.name)}
                      className="group label inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 font-bold text-muted hover:bg-sunken hover:text-fg focus-visible:text-fg"
                    >
                      <Pencil className="size-4" aria-hidden />
                      <span
                        className="hidden group-hover:inline group-focus-visible:inline"
                        aria-hidden
                      >
                        {t.platform.manage}
                      </span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
