'use client';

import {
  SHIFT_PRESETS,
  type CopyResult,
  type EmployeeView,
  type LocationView,
  type PublishResult,
  type RosterAuxiliaryView,
  type RosterConflictsView,
  type ShiftKind,
  type ReliefRequestView,
  type ShiftView,
  type StaffingView,
  type ZoneView,
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
  Skeleton,
  Spinner,
  cx,
  segmentedOptionStyles,
} from '@/components/ui';
import { useConfirm } from '@/components/confirm-dialog';
import { RosterGrid } from '@/components/roster-grid';
import { useToast } from '@/components/toast';
import { ReliefControl } from '@/components/relief-control';
import { StaffingEditor } from '@/components/staffing-editor';
import { ZonesSection } from '@/components/zones-section';
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
  const [publishing, setPublishing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [mode, setMode] = useState<'grid' | 'day'>('grid');
  const toast = useToast();

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
  const reliefs = useData<ReliefRequestView[]>(
    canManage && siteId ? `/tenant/relief?status=all&locationId=${siteId}` : null,
  );
  // The latest relief search per shift (the list is newest first).
  const reliefByShift = useMemo(() => {
    const map = new Map<string, ReliefRequestView>();
    for (const r of reliefs.data ?? []) if (!map.has(r.shiftId)) map.set(r.shiftId, r);
    return map;
  }, [reliefs.data]);
  // Relief shifts, by their own id: the original they replaced is cancelled and hidden.
  const reliefByNewShift = useMemo(
    () =>
      new Map(
        (reliefs.data ?? []).flatMap((r) => (r.newShiftId ? [[r.newShiftId, r] as const] : [])),
      ),
    [reliefs.data],
  );
  const roster = useData<ShiftView[]>(
    siteId ? `/tenant/roster?locationId=${siteId}&from=${monday}&to=${sunday}` : null,
  );
  const staffing = useData<StaffingView>(siteId ? `/tenant/locations/${siteId}/staffing` : null);
  const conflictsData = useData<RosterConflictsView>(
    siteId ? `/tenant/roster/conflicts?locationId=${siteId}&from=${monday}&to=${sunday}` : null,
  );
  const aux = useData<RosterAuxiliaryView>(
    siteId ? `/tenant/roster/aux?locationId=${siteId}&from=${monday}&to=${sunday}` : null,
  );
  const zones = useData<ZoneView[]>(canManage ? '/tenant/zones' : null);
  const site = activeSites.find((s) => s.id === siteId);
  const drafts = roster.data?.filter((s) => s.status === 'draft').length ?? 0;
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const today = todayLocal();

  function chooseSite(id: string) {
    setSiteId(id);
    try {
      localStorage.setItem(SITE_KEY, id);
    } catch {
      // Not remembered; harmless.
    }
  }

  async function publish() {
    if (!siteId) return;
    setPublishing(true);
    try {
      const result = await api<PublishResult>('/tenant/roster/publish', {
        body: { locationId: siteId, from: monday, to: sunday },
      });
      toast.push('success', t.schedule.published(result.published, result.notified));
      await roster.reload();
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : t.common.error);
    } finally {
      setPublishing(false);
    }
  }

  /** Removes a shift from the list immediately, then reconciles if the server rejects it. */
  async function removeShift(shift: ShiftView) {
    const previous = roster.data;
    roster.mutate((list) => list?.filter((s) => s.id !== shift.id) ?? null);
    try {
      await api(`/tenant/shifts/${shift.id}`, { method: 'DELETE' });
      toast.push(
        'success',
        shift.status === 'published' ? t.schedule.shiftCancelled : t.schedule.shiftRemoved,
      );
    } catch (e) {
      roster.mutate(previous);
      toast.push('error', e instanceof ApiError ? e.message : t.common.error);
    }
  }

  async function copyWeek() {
    if (!siteId) return;
    setCopying(true);
    try {
      const result = await api<CopyResult>('/tenant/roster/copy', {
        body: { locationId: siteId, from: monday, to: sunday },
      });
      toast.push('success', t.schedule.copied(result.copied));
      await roster.reload();
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : t.common.error);
    } finally {
      setCopying(false);
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
        {canManage && (
          <SegmentedControl
            className="grid grid-cols-2"
            role="radiogroup"
            aria-label={t.schedule.title}
          >
            {(
              [
                { value: 'grid', label: t.schedule.viewGrid },
                { value: 'day', label: t.schedule.viewDay },
              ] as const
            ).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={segmentedOptionStyles(mode === value)}
              >
                {label}
              </button>
            ))}
          </SegmentedControl>
        )}
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
      </div>

      {canManage && site && (
        <div className="mb-6 space-y-4">
          <StaffingEditor
            key={`${site.id}-${staffing.data ? 'loaded' : 'loading'}`}
            siteId={site.id}
            staffing={staffing.data}
            onSaved={staffing.reload}
          />
          <ZonesSection zones={zones.data ?? []} sites={activeSites} onChanged={zones.reload} />
        </div>
      )}

      {roster.error && <Alert>{roster.error}</Alert>}
      {!roster.data && !roster.error && (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-5 w-40" />
              <div className="mt-3 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      )}
      {roster.data && site && canManage && mode === 'grid' && (
        <RosterGrid
          site={site}
          days={days}
          shifts={roster.data}
          employees={employees.data ?? []}
          staffing={staffing.data}
          conflicts={conflictsData.data?.conflicts ?? []}
          leaves={conflictsData.data?.leaves ?? []}
          roving={aux.data?.roving ?? []}
          standby={aux.data?.standby ?? []}
          onChanged={roster.reload}
          onCopy={copyWeek}
          copying={copying}
        />
      )}
      {roster.data && site && (!canManage || mode === 'day') && (
        <div className="space-y-4">
          {days.map((day) => (
            <DayCard
              key={day}
              day={day}
              isToday={day === today}
              site={site}
              shifts={roster.data!.filter((s) => s.localDate === day)}
              employees={canManage ? (employees.data ?? []) : null}
              zones={zones.data ?? []}
              reliefByShift={reliefByShift}
              reliefByNewShift={reliefByNewShift}
              onChanged={roster.reload}
              onReliefChanged={async () => {
                await Promise.all([roster.reload(), reliefs.reload()]);
              }}
              onRemove={removeShift}
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
  zones,
  reliefByShift,
  reliefByNewShift,
  onChanged,
  onReliefChanged,
  onRemove,
}: {
  day: string;
  isToday: boolean;
  site: LocationView;
  shifts: ShiftView[];
  /** Null when the viewer cannot plan shifts. */
  employees: EmployeeView[] | null;
  zones: ZoneView[];
  reliefByShift: ReadonlyMap<string, ReliefRequestView>;
  reliefByNewShift: ReadonlyMap<string, ReliefRequestView>;
  onChanged: () => Promise<void>;
  onReliefChanged: () => Promise<void>;
  onRemove: (shift: ShiftView) => Promise<void>;
}) {
  const t = useT();
  const { confirm, confirmDialog } = useConfirm();
  const [adding, setAdding] = useState(false);

  async function remove(shift: ShiftView) {
    const question =
      shift.status === 'published'
        ? t.schedule.cancelConfirm(shift.employee.fullName)
        : t.schedule.deleteDraftConfirm(shift.employee.fullName);
    if (
      !(await confirm({
        message: question,
        confirmLabel:
          shift.status === 'published' ? t.schedule.cancelShift : t.schedule.deleteShift,
      }))
    )
      return;
    await onRemove(shift);
  }

  return (
    <Card className={cx('p-5', isToday && 'border-fg')}>
      {confirmDialog}
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
                {reliefByNewShift.get(s.id) && (
                  <p className="text-sm text-muted">
                    {t.relief.covers(reliefByNewShift.get(s.id)!.original.fullName)}
                  </p>
                )}
                {/* A published site shift still running or ahead can be handed to a relief. */}
                {employees &&
                  s.status === 'published' &&
                  s.kind !== 'standby' &&
                  s.location &&
                  Date.parse(s.endsAt) > Date.now() && (
                    <ReliefControl
                      shift={s}
                      request={reliefByShift.get(s.id)}
                      onChanged={onReliefChanged}
                    />
                  )}
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
          zones={zones}
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
  zones,
  onDone,
}: {
  day: string;
  site: LocationView;
  employees: EmployeeView[];
  zones: ZoneView[];
  onDone: (saved: boolean) => Promise<void>;
}) {
  const t = useT();
  const toast = useToast();
  // Officers contracted by the site's legal entity, those based at this site first.
  const candidates = useMemo(
    () =>
      employees
        .filter((e) => e.status === 'active' && e.legalEntity.id === site.legalEntity.id)
        .sort((a, b) => Number(b.location?.id === site.id) - Number(a.location?.id === site.id)),
    [employees, site],
  );
  const [employeeId, setEmployeeId] = useState(candidates[0]?.id ?? '');
  const [mode, setMode] = useState<'site' | 'roving' | 'standby'>('site');
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? '');
  const [kind, setKind] = useState<ShiftKind>('day');
  const [startTime, setStartTime] = useState(SHIFT_PRESETS.day.start);
  const [hours, setHours] = useState(String(SHIFT_PRESETS.day.hours));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function choose(next: 'day' | 'night' | 'custom') {
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
      const body: Record<string, unknown> = {
        employeeId,
        date: day,
        startTime,
        durationHours: Number(hours),
        kind: mode === 'standby' ? 'standby' : kind,
      };
      if (mode === 'roving') body.zoneId = zoneId || null;
      else if (mode === 'site') body.locationId = site.id;
      await api('/tenant/shifts', { body });
      toast.push('success', t.schedule.draftSaved);
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

  const kinds: { value: 'day' | 'night' | 'custom'; label: string }[] = [
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
        aria-label={t.workforce.assignmentType}
      >
        {(
          [
            { value: 'site', label: t.schedule.modeSite },
            { value: 'roving', label: t.schedule.modeRoving },
            { value: 'standby', label: t.schedule.modeStandby },
          ] as const
        ).map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            onClick={() => setMode(m.value)}
            className={segmentedOptionStyles(mode === m.value)}
          >
            {m.label}
          </button>
        ))}
      </SegmentedControl>
      {mode === 'roving' && (
        <Field label={t.schedule.zone} htmlFor={`zone-${day}`}>
          <Select id={`zone-${day}`} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {mode !== 'standby' && (
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
      )}
      {(mode === 'standby' || kind === 'custom') && (
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
      {mode === 'roving' && zones.length === 0 && (
        <p className="text-sm text-accent">{t.schedule.noZones}</p>
      )}
      <div className="flex gap-2">
        <Button loading={saving} disabled={mode === 'roving' && !zoneId} onClick={save}>
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
