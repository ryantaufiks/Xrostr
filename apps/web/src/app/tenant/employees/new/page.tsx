'use client';

import type { CreateEmployeeResponse, LocationView } from '@xrostr/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { EmployeeForm } from '@/components/employee-form';
import { InviteShare } from '@/components/invite-share';
import { Alert, Button, Card, PageHeader, Spinner, buttonStyles } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useData } from '@/lib/use-data';
import type { LegalEntityOption } from '@/lib/workforce';

export default function NewEmployeePage() {
  const t = useT();
  const entities = useData<LegalEntityOption[]>('/tenant/legal-entities');
  const locations = useData<LocationView[]>('/tenant/locations');
  const profile = useData<{ slug: string }>('/tenant/profile');
  const [created, setCreated] = useState<
    (CreateEmployeeResponse & { name: string; phone: string | null }) | null
  >(null);

  if (created) {
    return (
      <>
        <PageHeader title={t.workforce.added} description={t.workforce.addedHint(created.name)} />
        <Card className="space-y-6 p-5 sm:p-6">
          <InviteShare
            token={created.inviteToken}
            expiresAt={created.inviteExpiresAt}
            tenantSlug={profile.data?.slug ?? null}
            name={created.name}
            phone={created.phone}
          />
          <div className="flex flex-wrap gap-2 border-t border-line pt-6">
            <Link
              href={`/tenant/employees/${created.employeeId}`}
              className={buttonStyles('secondary')}
            >
              {t.workforce.viewEmployee}
            </Link>
            <Button type="button" variant="ghost" onClick={() => setCreated(null)}>
              {t.workforce.addAnother}
            </Button>
          </div>
        </Card>
      </>
    );
  }

  const error = entities.error ?? locations.error;
  return (
    <>
      <PageHeader title={t.workforce.add} description={t.workforce.newSubtitle} />
      {error && <Alert>{error}</Alert>}
      {(!entities.data || !locations.data) && !error && <Spinner />}
      {entities.data && locations.data && (
        <EmployeeForm<CreateEmployeeResponse>
          entities={entities.data}
          locations={locations.data}
          onSaved={(result, saved) => {
            setCreated({ ...result, name: saved.fullName, phone: saved.phone });
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </>
  );
}
