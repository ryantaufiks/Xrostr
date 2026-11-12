'use client';

import type { TenantSummary } from '@xrostr/contracts';
import { Building2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Badge, Card, PageHeader, Spinner, buttonStyles } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDate, PLAN_LABELS, REGION_LABELS } from '@/lib/format';

export default function TenantsPage() {
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<TenantSummary[]>('/platform/tenants')
      .then(setTenants)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan.'));
  }, []);

  return (
    <>
      <PageHeader
        title="Tenant"
        description="Perusahaan klien yang memakai Xrostr."
        actions={
          <Link href="/platform/tenants/new" className={buttonStyles('primary')}>
            <Plus className="size-4" aria-hidden />
            Buat tenant
          </Link>
        }
      />
      {error && <Alert>{error}</Alert>}
      {!tenants && !error && <Spinner />}
      {tenants?.length === 0 && (
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <Building2 className="size-10 text-faint" aria-hidden />
          <h2 className="mt-4 font-display text-xl font-bold">Belum ada tenant</h2>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Buat tenant pertama untuk mengundang administrator perusahaan klien.
          </p>
          <Link href="/platform/tenants/new" className={buttonStyles('primary', 'mt-6')}>
            Buat tenant
          </Link>
        </Card>
      )}
      {tenants && tenants.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line label text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Nama</th>
                <th className="px-5 py-3 font-medium">Slug</th>
                <th className="px-5 py-3 font-medium">Region data</th>
                <th className="px-5 py-3 font-medium">Paket</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Dibuat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-sunken">
                  <td className="px-5 py-3.5 font-medium text-fg">
                    <Link
                      href={`/platform/tenants/${t.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-muted">{t.slug}</td>
                  <td className="px-5 py-3.5 text-muted">
                    {REGION_LABELS[t.dataRegion] ?? t.dataRegion}
                  </td>
                  <td className="px-5 py-3.5 text-muted">{PLAN_LABELS[t.plan] ?? t.plan}</td>
                  <td className="px-5 py-3.5">
                    <Badge tone={t.status === 'active' ? 'active' : 'warn'}>
                      {t.status === 'active' ? 'Aktif' : 'Ditangguhkan'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-muted">{formatDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
