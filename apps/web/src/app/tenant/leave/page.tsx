'use client';

import { COUNTRY_CODES, type CountryCode, type Permission } from '@xrostr/contracts';
import { useState } from 'react';
import { HolidayCalendar } from '@/components/leave/holiday-calendar';
import { LeaveApprovals } from '@/components/leave/leave-approvals';
import { MyLeaveSection } from '@/components/leave/my-leave';
import { PageHeader } from '@/components/ui';
import { usePrincipal } from '@/lib/principal-context';
import { useData } from '@/lib/use-data';

export default function LeavePage() {
  const { permissions } = usePrincipal();
  const can = (p: Permission) => permissions.includes(p);
  const entities = useData<{ countryCode: CountryCode }[]>(
    can('entities.read') ? '/tenant/legal-entities' : null,
  );
  const [ownCountry, setOwnCountry] = useState<CountryCode | null>(null);
  const year = new Date().getFullYear();

  // The company's countries for HR; otherwise the employee's own country once known.
  const countries = entities.data
    ? COUNTRY_CODES.filter((c) => entities.data!.some((e) => e.countryCode === c))
    : ownCountry
      ? [ownCountry]
      : [];

  return (
    <>
      <PageHeader title="Cuti" description="Saldo, pengajuan, dan hari libur nasional." />
      <div className="space-y-12">
        {can('leave.approve') && <LeaveApprovals />}
        <MyLeaveSection onCountry={setOwnCountry} />
        {countries.length > 0 && (
          <HolidayCalendar
            key={countries.join()}
            countries={countries}
            year={year}
            canManage={can('holidays.manage')}
          />
        )}
      </div>
    </>
  );
}
