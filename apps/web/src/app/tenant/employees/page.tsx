'use client';

import type { EmployeeView } from '@xrostr/contracts';
import { ChevronRight, Plus, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Alert, Badge, Card, Input, PageHeader, Spinner, buttonStyles } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { usePrincipal } from '@/lib/principal-context';
import { useData } from '@/lib/use-data';
import { personStatus, roleLabel } from '@/lib/workforce';

export default function EmployeesPage() {
  const t = useT();
  const { permissions } = usePrincipal();
  const canManage = permissions.includes('employees.manage');
  const { data, error } = useData<EmployeeView[]>('/tenant/employees');
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!data || !q) return data;
    return data.filter((e) =>
      [e.fullName, e.employeeNo, e.email, e.location?.name ?? ''].some((v) =>
        v.toLowerCase().includes(q),
      ),
    );
  }, [data, query]);

  return (
    <>
      <PageHeader
        title={t.workforce.title}
        description={data ? t.workforce.count(data.length) : undefined}
        actions={
          canManage && (
            <Link href="/tenant/employees/new" className={buttonStyles('primary')}>
              <Plus className="size-5" aria-hidden />
              {t.workforce.add}
            </Link>
          )
        }
      />
      {error && <Alert>{error}</Alert>}
      {!data && !error && <Spinner />}
      {data && data.length > 0 && (
        <div className="relative mb-4">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.workforce.search}
            aria-label={t.workforce.searchLabel}
            className="pl-12"
          />
        </div>
      )}
      {data?.length === 0 && (
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <Users className="size-10 text-faint" aria-hidden />
          <h2 className="mt-4 font-display text-xl font-bold">{t.workforce.empty}</h2>
          <p className="mt-1 max-w-sm text-base text-muted">{t.workforce.emptyHint}</p>
        </Card>
      )}
      {shown && shown.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {shown.map((e) => {
              const status = personStatus(e.status, e.accountStatus);
              return (
                <li key={e.id}>
                  <Link
                    href={`/tenant/employees/${e.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-sunken"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold break-words text-fg">{e.fullName}</p>
                      <p className="mt-0.5 text-base text-muted">
                        <span className="font-mono">{e.employeeNo}</span> · {roleLabel(e.role)}
                        {e.location && ` · ${e.location.name}`}
                      </p>
                      {/* Phones: status under the name, so the name keeps the full width. */}
                      <div className="mt-2 sm:hidden">
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </div>
                    </div>
                    <div className="hidden sm:block">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-faint" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {shown && data && data.length > 0 && shown.length === 0 && (
        <p className="py-10 text-center text-base text-muted">{t.workforce.noMatch}</p>
      )}
    </>
  );
}
