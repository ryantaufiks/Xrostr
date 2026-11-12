'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, Card, PageHeader, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { COUNTRY_LABELS, formatDateTime } from '@/lib/format';
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

const ACTION_LABELS: Record<string, string> = {
  'auth.login_succeeded': 'Berhasil masuk',
  'auth.login_failed': 'Gagal masuk',
  'auth.account_locked': 'Akun dikunci',
  'auth.logout': 'Keluar',
  'auth.mfa_setup_started': 'Mulai mengatur 2FA',
  'auth.mfa_enabled': '2FA diaktifkan',
  'user.invite_accepted': 'Undangan diterima',
};

export default function TenantHome() {
  const principal = usePrincipal();
  const canReadEntities = principal.permissions.includes('entities.read');
  const canReadAudit = principal.permissions.includes('audit.read');

  return (
    <>
      <PageHeader
        title="Ringkasan perusahaan"
        description="Legal entity dan aktivitas terbaru di akun perusahaan Anda."
      />
      <div className="space-y-6">
        {canReadEntities && <LegalEntities />}
        {canReadAudit && <AuditLog />}
        {!canReadEntities && !canReadAudit && (
          <Card className="p-6 text-sm text-ink-500">
            Fitur untuk peran Anda (jadwal, absensi, cuti) hadir di Fase 1.
          </Card>
        )}
      </div>
    </>
  );
}

function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<T>(path)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan.'));
  }, [path]);
  return { data, error };
}

function LegalEntities() {
  const { data, error } = useData<LegalEntity[]>('/tenant/legal-entities');
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-ink-900">Legal entity</h2>
      {error && <Alert>{error}</Alert>}
      {!data && !error && <Spinner />}
      {data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((entity) => (
            <Card key={entity.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-ink-900">{entity.name}</p>
                <Badge tone="brand">{entity.countryCode}</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-ink-500">Negara</dt>
                <dd className="text-ink-800">
                  {COUNTRY_LABELS[entity.countryCode] ?? entity.countryCode}
                </dd>
                <dt className="text-ink-500">Mata uang</dt>
                <dd className="text-ink-800">{entity.currency}</dd>
                <dt className="text-ink-500">Zona waktu</dt>
                <dd className="text-ink-800">{entity.defaultTimezone}</dd>
                <dt className="text-ink-500">No. registrasi</dt>
                <dd className="text-ink-800">{entity.registrationNumber ?? '—'}</dd>
              </dl>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function AuditLog() {
  const { data, error } = useData<AuditRecord[]>('/tenant/audit-log?limit=20');
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-ink-900">Aktivitas terbaru</h2>
      {error && <Alert>{error}</Alert>}
      {!data && !error && <Spinner />}
      {data && (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-100 text-xs tracking-wide text-ink-500 uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Waktu</th>
                <th className="px-5 py-3 font-medium">Aktivitas</th>
                <th className="px-5 py-3 font-medium">Pelaku</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {data.map((record) => (
                <tr key={record.id}>
                  <td className="px-5 py-3 whitespace-nowrap text-ink-500">
                    {formatDateTime(record.createdAt)}
                  </td>
                  <td className="px-5 py-3 text-ink-800">
                    {ACTION_LABELS[record.action] ?? record.action}
                  </td>
                  <td className="px-5 py-3 text-ink-500">
                    {record.actorType === 'user' ? 'Pengguna' : record.actorType}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
