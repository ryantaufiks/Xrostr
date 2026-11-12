'use client';

import {
  SHIFT_PRESETS,
  type EmployeeView,
  type LocationView,
  type PublishResult,
  type ShiftKind,
  type ShiftView,
} from '@xrostr/contracts';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Moon,
  Plus,
  Send,
  Sun,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  IconButton,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
  Spinner,
  cx,
  segmentedOptionStyles,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { addDays, dayLabel, mondayOf, todayLocal, weekLabel } from '@/lib/dates';
import { usePrincipal } from '@/lib/principal-context';
import { attendanceSummary, shiftHours, shiftKindLabel } from '@/lib/shifts';
import { useData } from '@/lib/use-data';
import { useT } from '@/lib/i18n';

const SITE_KEY = 'xr-roster-site';

export default function RosterPage() {
  const t = useT();
  const { permissions } = usePrincipal();
  const canManage = permissions.includes('schedules.manage');
  const sites = useData<LocationView[]>('/tenant/locations');
  const employees = useData<EmployeeView[]>(canManage ? '/tenant/employees' : null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [monday, setMonday] = useState(() => mondayOf(todayLocal()));
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [publishing, setPublishing] = useState(false);

  const activeSites = useMemo(
    () => sites.data?.filter((s) => s.status === 'active') ?? [],
    [sites.data],
  );
  useEffect(() => {
    if (siteId || activeSites.length === 0) return;
    let remembered: string | null = null;
    try {
      remembered = localStorage.getItem(SITE_KEY);
    } catch {
      // Storage blocked: start from the first site.
    }
    setSiteId(activeSites.some((s) => s.id === remembered) ? remembered : activeSites[0]!.id);
  }, [activeSites, siteId]);

  const sunday = addDays(monday, 6);
  const roster = useData<ShiftView[]>(
    siteId ? `/tenant/roster?locationId=${siteId}&from=${monday}&to=${sunday}` : null,
  );
  const site = activeSites.find((s) => s.id === siteId);
  const drafts = roster.data?.filter((s) => s.status === 'draft').length ?? 0;
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const today = todayLocal();

  function chooseSite(id: string) {
    setSiteId(id);
    setMessage(null);
    try {
      localStorage.setItem(SITE_KEY, id);
    } catch {
      // Not remembered; harmless.
    }
  }

  async function publish() {
    if (!siteId) return;
    setPublishing(true);
    setMessage(null);
    try {
      const result = await api<PublishResult>('/tenant/roster/publish', {
        body: { locationId: siteId, from: monday, to: sunday },
      });
      setMessage({
        tone: 'success',
        text: t.schedule.published(result.published, result.notified),
      });
      await roster.reload();
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof ApiError ? e.message : t.common.error });
    } finally {
      setPublishing(false);
    }
  }

  if (sites.error) return <Alert>{sites.error}</Alert>;
  if (!sites.data) return <Spinner />;
  if (activeSites.length === 0) {
    return (
      <>
        <PageHeader title={t.schedule.title} />
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <CalendarDays className="size-10 text-faint" aria-hidden />
          <h2 className="mt-4 font-display text-xl font-bold">{t.schedule.noSites}</h2>
          <p className="mt-1 max-w-sm text-base text-muted">{t.schedule.noSitesHint}</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t.schedule.title}
        description={site ? `${site.name} · ${weekLabel(monday)}` : undefined}
      />
      <div className="mb-6 space-y-4">
        <Field label={t.schedule.site} htmlFor="site">
          <Select id="site" value={siteId ?? ''} onChange={(e) => chooseSite(e.target.value)}>
            {activeSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            aria-label={t.schedule.previousWeek}
            onClick={() => setMonday(addDays(monday, -7))}
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => setMonday(mondayOf(today))}>
            {t.schedule.thisWeek}
          </Button>
          <Button
            variant="secondary"
            aria-label={t.schedule.nextWeek}
            onClick={() => setMonday(addDays(monday, 7))}
          >
            <ChevronRight className="size-5" aria-hidden />
          </Button>
        </div>
        {canManage && (
          <Button className="w-full" disabled={drafts === 0} loading={publishing} onClick={publish}>
            <Send className="size-5" aria-hidden />
            {drafts > 0
              ? t.schedule.publishDrafts(drafts)
              : roster.data?.length
                ? t.schedule.allPublished
                : t.schedule.nothingToPublish}
          </Button>
        )}
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
      </div>

      {roster.error && <Alert>{roster.error}</Alert>}
      {!roster.data && !roster.error && <Spinner />}
      {roster.data && site && (
        <div className="space-y-4">
          {days.map((day) => (
            <DayCard
              key={day}
              day={day}
              isToday={day === today}
              site={site}
              shifts={roster.data!.filter((s) => s.localDate === day)}
              employees={canManage ? (employees.data ?? []) : null}
              onChanged={roster.reload}
            />
          ))}
        </div>
      )}
    </>
  );
}

function DayCard({
  day,
  isToday,
  site,
  shifts,
  employees,
  onChanged,
}: {
  day: string;
  isToday: boolean;
  site: LocationView;
  shifts: ShiftView[];
  /** Null when the viewer cannot plan shifts. */
  employees: EmployeeView[] | null;
  onChanged: () => Promise<void>;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(shift: ShiftView) {
    const question =
      shift.status === 'published'
        ? t.schedule.cancelConfirm(shift.employee.fullName)
        : t.schedule.deleteDraftConfirm(shift.employee.fullName);
    if (!window.confirm(question)) return;
    setError(null);
    try {
      await api(`/tenant/shifts/${shift.id}`, { method: 'DELETE' });
      await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.common.error);
    }
  }

  return (
    <Card className={cx('p-5', isToday && 'border-fg')}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-fg">
          {dayLabel(day)}
          {isToday && <span className="label ml-2 text-accent">{t.schedule.today}</span>}
        </h2>
        {employees && !adding && (
          <Button
            variant="ghost"
            className="px-3"
            onClick={() => setAdding(true)}
            aria-label={t.schedule.addShiftOn(dayLabel(day))}
          >
            <Plus className="size-5" aria-hidden />
            {t.schedule.shift}
          </Button>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {shifts.length === 0 && !adding && (
        <p className="mt-2 text-base text-faint">{t.schedule.noShifts}</p>
      )}
      {shifts.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {shifts.map((s) => (
            <li key={s.id} className="flex items-start gap-3 py-3">
              {s.kind === 'night' ? (
                <Moon className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
              ) : (
                <Sun className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
              )}
              {/* Everything stacks in one column so names and statuses never wrap word by word. */}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-base font-semibold break-words text-fg">{s.employee.fullName}</p>
                <p className="text-sm text-muted">
                  {shiftKindLabel(s.kind)} · {shiftHours(s)}
                </p>
                <AttendanceNote shift={s} />
                <Badge tone={s.status === 'draft' ? 'warn' : 'active'}>
                  {s.status === 'draft' ? t.schedule.draft : t.schedule.publishedBadge}
                </Badge>
              </div>
              {employees && (
                <IconButton
                  onClick={() => remove(s)}
                  aria-label={
                    s.status === 'published' ? t.schedule.cancelShift : t.schedule.deleteShift
                  }
                  tone="danger"
                >
                  <Trash2 className="size-5" aria-hidden />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && employees && (
        <AddShift
          day={day}
          site={site}
          employees={employees}
          onDone={async (saved) => {
            setAdding(false);
            if (saved) await onChanged();
          }}
        />
      )}
    </Card>
  );
}

function AddShift({
  day,
  site,
  employees,
  onDone,
}: {
  day: string;
  site: LocationView;
  employees: EmployeeView[];
  onDone: (saved: boolean) => Promise<void>;
}) {
  const t = useT();
  // Officers contracted by the site's legal entity, those based at this site first.
  const candidates = useMemo(
    () =>
      employees
        .filter((e) => e.status === 'active' && e.legalEntity.id === site.legalEntity.id)
        .sort((a, b) => Number(b.location?.id === site.id) - Number(a.location?.id === site.id)),
    [employees, site],
  );
  const [employeeId, setEmployeeId] = useState(candidates[0]?.id ?? '');
  const [kind, setKind] = useState<ShiftKind>('day');
  const [startTime, setStartTime] = useState(SHIFT_PRESETS.day.start);
  const [hours, setHours] = useState(String(SHIFT_PRESETS.day.hours));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function choose(next: ShiftKind) {
    setKind(next);
    if (next !== 'custom') {
      setStartTime(SHIFT_PRESETS[next].start);
      setHours(String(SHIFT_PRESETS[next].hours));
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api('/tenant/shifts', {
        body: {
          locationId: site.id,
          employeeId,
          date: day,
          startTime,
          durationHours: Number(hours),
          kind,
        },
      });
      await onDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.common.error);
      setSaving(false);
    }
  }

  if (candidates.length === 0) {
    return (
      <div className="mt-4 space-y-3">
        <Alert>{t.schedule.noCandidates}</Alert>
        <Button variant="secondary" onClick={() => onDone(false)}>
          {t.schedule.close}
        </Button>
      </div>
    );
  }

  const kinds: { value: ShiftKind; label: string }[] = [
    { value: 'day', label: t.schedule.presetDay },
    { value: 'night', label: t.schedule.presetNight },
    { value: 'custom', label: t.schedule.presetCustom },
  ];
  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      {error && <Alert>{error}</Alert>}
      <Field label={t.schedule.officer} htmlFor={`officer-${day}`}>
        <Select
          id={`officer-${day}`}
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
        >
          {candidates.map((e) => (
            <option key={e.id} value={e.id}>
              {e.fullName} ({e.employeeNo})
            </option>
          ))}
        </Select>
      </Field>
      <SegmentedControl
        className="grid grid-cols-3"
        role="radiogroup"
        aria-label={t.schedule.shiftType}
      >
        {kinds.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={kind === k.value}
            onClick={() => choose(k.value)}
            className={segmentedOptionStyles(kind === k.value)}
          >
            {k.label}
          </button>
        ))}
      </SegmentedControl>
      {kind === 'custom' && (
        <div className="grid grid-cols-2 gap-4">
          <Field label={t.schedule.start} htmlFor={`start-${day}`}>
            <Input
              id={`start-${day}`}
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Field>
          <Field label={t.schedule.duration} htmlFor={`hours-${day}`}>
            <Input
              id={`hours-${day}`}
              type="number"
              min={1}
              max={24}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </Field>
        </div>
      )}
      <div className="flex gap-2">
        <Button loading={saving} onClick={save}>
          {t.schedule.saveDraft}
        </Button>
        <Button variant="ghost" onClick={() => onDone(false)}>
          {t.common.cancel}
        </Button>
      </div>
    </div>
  );
}

/** Check-in status of a published shift: present, late, left, or not yet arrived. */
function AttendanceNote({ shift }: { shift: ShiftView }) {
  const t = useT();
  if (shift.status !== 'published') return null;
  const summary = attendanceSummary(shift);
  if (summary) {
    return (
      <p className={cx('text-sm font-semibold', summary.late ? 'text-accent' : 'text-fg')}>
        {summary.text}
      </p>
    );
  }
  const started = Date.parse(shift.startsAt) <= Date.now();
  return started ? (
    <p className="text-sm font-semibold text-accent">{t.schedule.notCheckedIn}</p>
  ) : null;
}
