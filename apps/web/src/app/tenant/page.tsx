'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, Card, PageHeader, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { COUNTRY_LABELS, formatDateTime } from '@/lib/format';
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

const ACTION_LABELS: Record<string, string> = {
  'auth.login_succeeded': 'Berhasil masuk',
  'auth.login_failed': 'Gagal masuk',
  'auth.account_locked': 'Akun dikunci',
  'auth.logout': 'Keluar',
  'auth.mfa_setup_started': 'Mulai mengatur 2FA',
  'auth.mfa_enabled': '2FA diaktifkan',
  'user.invite_accepted': 'Undangan diterima',
  'auth.password_changed': 'Password diganti',
  'tenant.created': 'Perusahaan dibuat',
  'employee.created': 'Karyawan ditambahkan',
  'employee.updated': 'Data karyawan diubah',
  'employee.invite_reissued': 'Undangan dikirim ulang',
  'location.created': 'Site ditambahkan',
  'location.updated': 'Data site diubah',
  'shift.cancelled': 'Shift dibatalkan',
  'schedule.published': 'Jadwal diterbitkan',
  'location.checkin_code_rotated': 'Kode QR site diganti',
  'auth.password_change_failed': 'Gagal mengganti password',
  'leave.requested': 'Cuti diajukan',
  'leave.cancelled': 'Pengajuan cuti dibatalkan',
  'leave.approved': 'Cuti disetujui',
  'leave.rejected': 'Cuti ditolak',
  'holiday.created': 'Hari libur ditambahkan',
  'holiday.removed': 'Hari libur dihapus',
};

const actionLabel = (action: string) => ACTION_LABELS[action] ?? action;
const actorLabel = (actorType: string) => (actorType === 'user' ? 'Pengguna' : actorType);

export default function TenantHome() {
  const principal = usePrincipal();
  const canReadEntities = principal.permissions.includes('entities.read');
  const canReadAudit = principal.permissions.includes('audit.read');

  // Officers have no company-wide data to see; their home is about their own work.
  if (!canReadEntities && !canReadAudit) {
    return (
      <>
        <PageHeader title="Jadwal saya" description="Selamat bertugas." />
        <MyShifts />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Ringkasan perusahaan"
        description="Legal entity dan aktivitas terbaru di akun perusahaan Anda."
      />
      <div className="space-y-6">
        {canReadEntities && <LegalEntities />}
        {canReadAudit && <AuditLog />}
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
      <h2 className="label mb-3 text-muted">Legal entity</h2>
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
                <dt className="text-muted">Negara</dt>
                <dd className="text-fg">
                  {COUNTRY_LABELS[entity.countryCode] ?? entity.countryCode}
                </dd>
                <dt className="text-muted">Mata uang</dt>
                <dd className="text-fg">{entity.currency}</dd>
                <dt className="text-muted">Zona waktu</dt>
                <dd className="text-fg">{entity.defaultTimezone}</dd>
                <dt className="text-muted">No. registrasi</dt>
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
  const { data, error } = useData<AuditRecord[]>('/tenant/audit-log?limit=20');
  return (
    <section>
      <h2 className="label mb-3 text-muted">Aktivitas terbaru</h2>
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
                <th className="px-5 py-3 font-bold">Waktu</th>
                <th className="px-5 py-3 font-bold">Aktivitas</th>
                <th className="px-5 py-3 font-bold">Pelaku</th>
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
