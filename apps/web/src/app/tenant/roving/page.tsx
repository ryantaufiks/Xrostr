'use client';

import type { RovingShiftVisits, VisitState } from '@xrostr/contracts';
import { ChevronLeft, ChevronRight, Footprints, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Alert, Badge, Button, Card, PageHeader, Skeleton, cx } from '@/components/ui';
import { addDays, dayLabel, todayLocal } from '@/lib/dates';
import { useT } from '@/lib/i18n';
import { localClock, shiftHours } from '@/lib/shifts';
import { useData } from '@/lib/use-data';

const STATE_TONE: Record<VisitState, 'neutral' | 'active' | 'warn'> = {
  met: 'active',
  pending: 'neutral',
  behind: 'warn',
  missed: 'warn',
  unserved: 'warn',
  none: 'neutral',
};

/** Supervisor view: per roving shift on a day, each zone site's visits against its target. */
export default function RovingVisitsPage() {
  const t = useT();
  const today = todayLocal();
  const [date, setDate] = useState(today);
  const data = useData<RovingShiftVisits[]>(`/tenant/roving/visits?date=${date}`, 60_000);

  return (
    <>
      <PageHeader title={t.visits.title} description={t.visits.description} />
      <div className="mb-6 flex items-center gap-2">
        <Button
          variant="secondary"
          aria-label={t.visits.previousDay}
          onClick={() => setDate(addDays(date, -1))}
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => setDate(today)}>
          {date === today ? `${t.visits.today} · ${dayLabel(date)}` : dayLabel(date)}
        </Button>
        <Button
          variant="secondary"
          aria-label={t.visits.nextDay}
          onClick={() => setDate(addDays(date, 1))}
        >
          <ChevronRight className="size-5" aria-hidden />
        </Button>
      </div>

      {data.error && <Alert>{data.error}</Alert>}
      {!data.data && !data.error && (
        <Card className="space-y-3 p-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </Card>
      )}
      {data.data?.length === 0 && (
        <Card className="flex flex-col items-center px-6 py-14 text-center">
          <Footprints className="size-10 text-faint" aria-hidden />
          <p className="mt-4 text-base text-muted">{t.visits.empty}</p>
        </Card>
      )}
      <div className="space-y-4">
        {data.data?.map((shift) => (
          <ShiftVisits key={shift.shiftId} shift={shift} />
        ))}
      </div>
    </>
  );
}

function ShiftVisits({ shift }: { shift: RovingShiftVisits }) {
  const t = useT();
  const clock = (iso: string) => localClock(iso, shift.timezone);
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-lg font-bold text-fg">{shift.employee.fullName}</p>
          <p className="text-base text-muted">
            {shift.zone.name} · {shiftHours(shift)}
          </p>
        </div>
        <Badge tone={shift.phase === 'running' ? 'active' : 'neutral'}>
          {t.visits.phases[shift.phase]}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-muted">
        {shift.checkedInAt ? t.visits.checkedInAt(clock(shift.checkedInAt)) : t.visits.notCheckedIn}
        {' · '}
        {t.visits.gap(shift.visitGapMinutes)}
      </p>
      {shift.unservedSince && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-accent p-3 text-sm font-semibold text-accent">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t.visits.unserved(clock(shift.unservedSince), shift.pulledTo?.name ?? '')}
        </div>
      )}
      <ul className="mt-4 divide-y divide-line border-t border-line">
        {shift.sites.map((s) => (
          <li key={s.location.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-fg">{s.location.name}</p>
              <p className="text-sm text-muted">
                {s.lastVisitAt ? t.visits.lastVisit(clock(s.lastVisitAt)) : t.visits.neverVisited}
              </p>
            </div>
            <span
              className={cx(
                'text-lg font-bold tabular-nums',
                STATE_TONE[s.state] === 'warn' ? 'text-accent' : 'text-fg',
              )}
            >
              {s.minVisits > 0
                ? t.visits.count(s.visits, s.minVisits)
                : t.visits.countNoTarget(s.visits)}
            </span>
            <Badge tone={STATE_TONE[s.state]}>{t.visits.states[s.state]}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
