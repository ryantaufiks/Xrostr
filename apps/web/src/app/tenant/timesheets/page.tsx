'use client';

import type { LocationView, TimesheetEntry, TimesheetView } from '@xrostr/contracts';
import { ChevronLeft, ChevronRight, ClipboardClock, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useToast } from '@/components/toast';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  cx,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { addDays, dayLabel, todayLocal } from '@/lib/dates';
import { useT } from '@/lib/i18n';
import { intlLocale } from '@/lib/i18n/state';
import { formatMinutes } from '@/lib/money';
import { usePrincipal } from '@/lib/principal-context';
import { localClock, shiftHours } from '@/lib/shifts';
import { useData } from '@/lib/use-data';
import { zonedClock, zonedToIso } from '@/lib/zoned';

const monthOf = (date: string) => date.slice(0, 7);
const firstDay = (month: string) => `${month}-01`;
const lastDay = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};
const needsAttention = (e: TimesheetEntry) => e.status === 'incomplete' || e.status === 'absent';

/** Monthly timesheets per legal entity, with corrections for planners and payroll staff. */
export default function TimesheetsPage() {
  const t = useT();
  const { permissions } = usePrincipal();
  const canCorrect =
    permissions.includes('schedules.manage') || permissions.includes('payroll.manage');
  const locations = useData<LocationView[]>('/tenant/locations');
  const entities = useMemo(() => {
    const map = new Map<string, LocationView['legalEntity']>();
    for (const l of locations.data ?? []) map.set(l.legalEntity.id, l.legalEntity);
    return [...map.values()];
  }, [locations.data]);
  const [entityId, setEntityId] = useState<string | null>(null);
  const entity = entityId ?? entities[0]?.id ?? null;
  const [month, setMonth] = useState(monthOf(todayLocal()));
  const [onlyIssues, setOnlyIssues] = useState(false);
  const sheet = useData<TimesheetView>(
    entity
      ? `/tenant/timesheets?legalEntityId=${entity}&from=${firstDay(month)}&to=${lastDay(month)}`
      : null,
  );
  const minutes = (m: number) => formatMinutes(m, t.payroll.hours, t.payroll.minutes);
  const monthLabel = new Intl.DateTimeFormat(intlLocale(), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${firstDay(month)}T00:00:00Z`));

  const rows = (sheet.data?.employees ?? []).filter(
    (r) => !onlyIssues || r.entries.some(needsAttention),
  );

  return (
    <>
      <PageHeader title={t.payroll.timesheetTitle} description={t.payroll.timesheetDescription} />
      <div className="mb-6 space-y-4">
        {entities.length > 1 && (
          <Field label={t.payroll.entity} htmlFor="ts-entity">
            <Select
              id="ts-entity"
              value={entity ?? ''}
              onChange={(e) => setEntityId(e.target.value)}
            >
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            aria-label={t.payroll.previousMonth}
            title={t.payroll.previousMonth}
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setMonth(monthOf(todayLocal()))}
          >
            {monthLabel}
          </Button>
          <Button
            variant="secondary"
            aria-label={t.payroll.nextMonth}
            title={t.payroll.nextMonth}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight className="size-5" aria-hidden />
          </Button>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-base text-fg">
          <input
            type="checkbox"
            className="size-5"
            checked={onlyIssues}
            onChange={(e) => setOnlyIssues(e.target.checked)}
          />
          {t.payroll.onlyIssues}
        </label>
        {sheet.data && (
          <p className="text-sm text-muted">
            {t.payroll.workingTimeNote(
              minutes(sheet.data.workingTime.dailyMinutes[5]),
              minutes(sheet.data.workingTime.dailyMinutes[6]),
              minutes(sheet.data.workingTime.weeklyMinutes),
              sheet.data.workingTime.basis,
            )}
          </p>
        )}
      </div>

      {(locations.error ?? sheet.error) && <Alert>{locations.error ?? sheet.error}</Alert>}
      {!sheet.data && !sheet.error && (
        <Card className="space-y-3 p-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-3/4" />
        </Card>
      )}
      {sheet.data && rows.length === 0 && (
        <Card className="flex flex-col items-center px-6 py-14 text-center">
          <ClipboardClock className="size-10 text-faint" aria-hidden />
          <p className="mt-4 text-base text-muted">
            {onlyIssues && sheet.data.employees.length > 0
              ? t.payroll.noIssues
              : t.payroll.noShifts}
          </p>
        </Card>
      )}
      <div className="space-y-4">
        {rows.map((r) => (
          <EmployeeSheet
            key={r.employee.id}
            row={r}
            onlyIssues={onlyIssues}
            canCorrect={canCorrect}
            minutes={minutes}
            onCorrected={sheet.reload}
          />
        ))}
      </div>
    </>
  );
}

function EmployeeSheet({
  row,
  onlyIssues,
  canCorrect,
  minutes,
  onCorrected,
}: {
  row: TimesheetView['employees'][number];
  onlyIssues: boolean;
  canCorrect: boolean;
  minutes: (m: number) => string;
  onCorrected: () => Promise<void>;
}) {
  const t = useT();
  const s = row.totals;
  const issues = s.incomplete + s.absences;
  const stats: [string, string, boolean][] = [
    [t.payroll.totals.daysWorked, String(s.daysWorked), false],
    [t.payroll.totals.worked, minutes(s.workedMinutes), false],
    [t.payroll.totals.overtime, minutes(s.overtimeMinutes), s.overtimeMinutes > 0],
    [t.payroll.totals.restDay, minutes(s.restDayMinutes), s.restDayMinutes > 0],
    [t.payroll.totals.holiday, minutes(s.publicHolidayMinutes), s.publicHolidayMinutes > 0],
    [t.payroll.totals.late, minutes(s.lateMinutes), s.lateMinutes > 0],
    [t.payroll.totals.absences, String(s.absences), s.absences > 0],
    [t.payroll.totals.incomplete, String(s.incomplete), s.incomplete > 0],
    [t.payroll.totals.standby, minutes(s.standbyMinutes), false],
    [t.payroll.totals.callouts, String(s.callouts), false],
    [t.payroll.totals.leave, t.payroll.leaveDays(s.paidLeaveDays, s.unpaidLeaveDays), false],
  ];
  const entries = onlyIssues ? row.entries.filter(needsAttention) : row.entries;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold text-fg">{row.employee.fullName}</p>
          <p className="text-sm text-muted">
            {row.employee.employeeNo} · {t.payroll.workDaysValue(row.workDaysPerWeek)}
          </p>
        </div>
        {issues > 0 && <Badge tone="warn">{`${t.payroll.totals.incomplete}: ${issues}`}</Badge>}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {stats.map(([label, value, strong]) => (
          <div key={label}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className={cx('text-base tabular-nums', strong ? 'font-bold text-fg' : 'text-fg')}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <details className="mt-4 border-t border-line pt-3" open={onlyIssues}>
        <summary className="cursor-pointer text-sm font-semibold text-muted">
          {`${row.entries.length} shift`}
        </summary>
        <ul className="mt-2 divide-y divide-line">
          {entries.map((e) => (
            <EntryRow
              key={e.shiftId}
              entry={e}
              canCorrect={canCorrect}
              minutes={minutes}
              onCorrected={onCorrected}
            />
          ))}
        </ul>
      </details>
    </Card>
  );
}

function EntryRow({
  entry: e,
  canCorrect,
  minutes,
  onCorrected,
}: {
  entry: TimesheetEntry;
  canCorrect: boolean;
  minutes: (m: number) => string;
  onCorrected: () => Promise<void>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const flags = [
    e.overtimeMinutes > 0 && t.payroll.flags.overtime(minutes(e.overtimeMinutes)),
    e.lateMinutes > 0 && t.payroll.flags.late(e.lateMinutes),
    e.earlyLeaveMinutes > 0 && t.payroll.flags.early(e.earlyLeaveMinutes),
    e.restDay && t.payroll.flags.restDay,
    e.publicHoliday && t.payroll.flags.holiday,
    e.callout && t.payroll.flags.callout,
  ].filter(Boolean);
  const correctable = canCorrect && ['worked', 'incomplete', 'absent'].includes(e.status);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-fg">
            {dayLabel(e.localDate)} · {shiftHours(e)}
          </p>
          <p className="text-sm text-muted">
            {e.place}
            {e.checkInAt && ` · ${localClock(e.checkInAt, e.timezone)}`}
            {e.checkOutAt && `–${localClock(e.checkOutAt, e.timezone)}`}
            {flags.length > 0 && ` · ${flags.join(' · ')}`}
          </p>
          {e.correction && (
            <p className="text-sm text-muted">
              {t.payroll.correctedBy(e.correction.by, e.correction.reason)}
            </p>
          )}
        </div>
        <span className="text-base font-bold text-fg tabular-nums">
          {e.workedMinutes > 0 ? minutes(e.workedMinutes) : '—'}
        </span>
        <Badge tone={needsAttention(e) ? 'warn' : e.status === 'worked' ? 'active' : 'neutral'}>
          {t.payroll.statuses[e.status]}
        </Badge>
        {correctable && !open && (
          <Button variant="ghost" className="min-h-11 px-2" onClick={() => setOpen(true)}>
            <Pencil className="size-4" aria-hidden />
            {t.payroll.correct}
          </Button>
        )}
      </div>
      {open && (
        <CorrectionForm
          entry={e}
          onCancel={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            await onCorrected();
          }}
        />
      )}
    </li>
  );
}

/** Check-in and check-out as local times at the site; a check-out before the start is next day. */
function CorrectionForm({
  entry: e,
  onCancel,
  onSaved,
}: {
  entry: TimesheetEntry;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useT();
  const toast = useToast();
  const [checkIn, setCheckIn] = useState(
    e.checkInAt ? zonedClock(e.checkInAt, e.timezone) : e.localStart,
  );
  const [checkOut, setCheckOut] = useState(
    e.checkOutAt ? zonedClock(e.checkOutAt, e.timezone) : e.localEnd,
  );
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    // A night shift ends the next morning: a check-out earlier than the start belongs there.
    const outDate = checkOut <= e.localStart ? addDays(e.localDate, 1) : e.localDate;
    setSaving(true);
    setError(null);
    try {
      await api(`/tenant/timesheets/${e.shiftId}/corrections`, {
        body: {
          checkInAt: zonedToIso(e.localDate, checkIn, e.timezone),
          checkOutAt: zonedToIso(outDate, checkOut, e.timezone),
          reason: reason.trim(),
        },
      });
      toast.push('success', t.payroll.correctionSaved);
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.common.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-line p-4">
      <p className="label font-bold text-fg">{t.payroll.correctTitle}</p>
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.payroll.checkIn} htmlFor={`in-${e.shiftId}`}>
          <Input
            id={`in-${e.shiftId}`}
            type="time"
            value={checkIn}
            onChange={(x) => setCheckIn(x.target.value)}
          />
        </Field>
        <Field label={t.payroll.checkOut} htmlFor={`out-${e.shiftId}`}>
          <Input
            id={`out-${e.shiftId}`}
            type="time"
            value={checkOut}
            onChange={(x) => setCheckOut(x.target.value)}
          />
        </Field>
      </div>
      <Field label={t.payroll.reason} htmlFor={`why-${e.shiftId}`} hint={t.payroll.reasonHint}>
        <Input id={`why-${e.shiftId}`} value={reason} onChange={(x) => setReason(x.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button
          loading={saving}
          disabled={reason.trim().length < 3 || !checkIn || !checkOut}
          onClick={save}
        >
          {t.payroll.saveCorrection}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t.common.cancel}
        </Button>
      </div>
    </div>
  );
}
