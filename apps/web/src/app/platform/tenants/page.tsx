'use client';

import type { TenantSummary } from '@xrostr/contracts';
import { Building2, ChevronRight, Pencil, Plus } from 'lucide-react';
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
        <ul className="space-y-3 sm:hidden">
          {tenants.map((t) => (
            <li key={t.id}>
              <Link href={`/platform/tenants/${t.id}`} className="block">
                <Card className="flex items-center gap-4 p-5 hover:bg-sunken">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-lg font-semibold text-fg">{t.name}</p>
                    <p className="font-mono text-sm text-muted">{t.slug}</p>
                    <p className="text-base text-muted">
                      {REGION_LABELS[t.dataRegion] ?? t.dataRegion} ·{' '}
                      {PLAN_LABELS[t.plan] ?? t.plan}
                    </p>
                    <Badge tone={t.status === 'active' ? 'active' : 'warn'}>
                      {t.status === 'active' ? 'Aktif' : 'Ditangguhkan'}
                    </Badge>
                  </div>
                  <ChevronRight className="size-6 shrink-0 text-muted" aria-label="Kelola" />
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
                <th className="px-5 py-3 font-medium">Nama</th>
                <th className="px-5 py-3 font-medium">Slug</th>
                <th className="px-5 py-3 font-medium">Region data</th>
                <th className="px-5 py-3 font-medium">Paket</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Dibuat</th>
                <th className="px-5 py-3 font-medium">
                  <span className="sr-only">Aksi</span>
                </th>
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
                  <td className="px-5 py-3.5 text-right">
                    {/* Icon only; the label slides in on hover or keyboard focus. */}
                    <Link
                      href={`/platform/tenants/${t.id}`}
                      aria-label={`Kelola ${t.name}`}
                      className="group label inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 font-bold text-muted hover:bg-sunken hover:text-fg focus-visible:text-fg"
                    >
                      <Pencil className="size-4" aria-hidden />
                      <span
                        className="hidden group-hover:inline group-focus-visible:inline"
                        aria-hidden
                      >
                        Kelola
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
