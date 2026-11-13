'use client';

import type { EmployeeView, InviteLink, LocationView } from '@xrostr/contracts';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { EmployeeForm } from '@/components/employee-form';
import { InviteShare } from '@/components/invite-share';
import { PayProfileCard } from '@/components/pay-profile-card';
import { Alert, Badge, Button, Card, PageHeader, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { usePrincipal } from '@/lib/principal-context';
import { useData } from '@/lib/use-data';
import { personStatus, roleLabel, type LegalEntityOption } from '@/lib/workforce';

export default function EmployeePage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const { permissions } = usePrincipal();
  const canManage = permissions.includes('employees.manage');
  const employees = useData<EmployeeView[]>('/tenant/employees');
  const entities = useData<LegalEntityOption[]>(canManage ? '/tenant/legal-entities' : null);
  const locations = useData<LocationView[]>('/tenant/locations');
  const profile = useData<{ slug: string }>('/tenant/profile');
  const [invite, setInvite] = useState<InviteLink | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const employee = employees.data?.find((e) => e.id === id);

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof ApiError ? e.message : t.common.error });
    } finally {
      setBusy(false);
    }
  }

  const toggleStatus = () =>
    act(async () => {
      const next = employee!.status === 'active' ? 'inactive' : 'active';
      await api(`/tenant/employees/${id}`, { method: 'PATCH', body: { status: next } });
      await employees.reload();
      setMessage({
        tone: 'success',
        text: next === 'inactive' ? t.workforce.deactivated : t.workforce.reactivated,
      });
    });

  const reissue = () =>
    act(async () => {
      setInvite(await api<InviteLink>(`/tenant/employees/${id}/invite`, { method: 'POST' }));
    });

  const error = employees.error ?? entities.error ?? locations.error;
  if (error) return <Alert>{error}</Alert>;
  if (!employees.data || !locations.data || (canManage && !entities.data)) return <Spinner />;
  if (!employee) return <Alert>{t.workforce.notFound}</Alert>;

  const status = personStatus(employee.status, employee.accountStatus);
  return (
    <>
      <PageHeader
        title={employee.fullName}
        description={`${employee.employeeNo} · ${roleLabel(employee.role)}`}
        actions={<Badge tone={status.tone}>{status.label}</Badge>}
      />
      <div className="space-y-6">
        {message && <Alert tone={message.tone}>{message.text}</Alert>}

        {canManage && (
          <Card className="space-y-4 p-5 sm:p-6">
            <h2 className="label font-bold text-fg">{t.workforce.access}</h2>
            {employee.accountStatus === 'invited' && employee.status === 'active' && (
              <p className="text-base text-muted">{t.workforce.notActivated(employee.fullName)}</p>
            )}
            {invite && (
              <InviteShare
                token={invite.inviteToken}
                expiresAt={invite.inviteExpiresAt}
                tenantSlug={profile.data?.slug ?? null}
                name={employee.fullName}
                phone={employee.phone}
              />
            )}
            <div className="flex flex-wrap gap-2">
              {employee.accountStatus === 'invited' && employee.status === 'active' && !invite && (
                <Button type="button" loading={busy} onClick={reissue}>
                  {t.workforce.resendInvite}
                </Button>
              )}
              <Button type="button" variant="secondary" disabled={busy} onClick={toggleStatus}>
                {employee.status === 'active' ? t.workforce.deactivate : t.workforce.reactivate}
              </Button>
            </div>
          </Card>
        )}

        {canManage && entities.data ? (
          <EmployeeForm<EmployeeView>
            key={employee.id}
            entities={entities.data}
            locations={locations.data}
            employee={employee}
            onSaved={async () => {
              await employees.reload();
              setMessage({ tone: 'success', text: t.workforce.saved });
              window.scrollTo({ top: 0 });
            }}
          />
        ) : (
          <Card className="p-5 text-base sm:p-6">
            <dl className="grid grid-cols-[140px_1fr] gap-y-2.5">
              <dt className="text-muted">{t.workforce.email}</dt>
              <dd>{employee.email}</dd>
              <dt className="text-muted">{t.workforce.phoneShort}</dt>
              <dd>{employee.phone ?? '—'}</dd>
              <dt className="text-muted">{t.workforce.site}</dt>
              <dd>{employee.location?.name ?? '—'}</dd>
              <dt className="text-muted">{t.workforce.jobTitle}</dt>
              <dd>{employee.jobTitle ?? '—'}</dd>
            </dl>
          </Card>
        )}

        {permissions.includes('payroll.read') && (
          <PayProfileCard
            employeeId={employee.id}
            canManage={permissions.includes('payroll.manage')}
          />
        )}
      </div>
    </>
  );
}
