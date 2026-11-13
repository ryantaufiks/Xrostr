'use client';

import {
  SHIFT_PRESETS,
  type EmployeeView,
  type LeaveSpan,
  type LocationView,
  type ShiftConflict,
  type ShiftKind,
  type ShiftView,
  type StaffingView,
} from '@xrostr/contracts';
import { AlertTriangle, Copy, Eraser, Plus, Repeat, Sparkles, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useToast } from '@/components/toast';
import { api, ApiError } from '@/lib/api';
import { addDays, dayLabel } from '@/lib/dates';
import { useT } from '@/lib/i18n';
import { shiftKindShort } from '@/lib/shifts';
import { RosterAutofill } from './roster-autofill';
import { RotationPanel } from './rotation-panel';
import { Button, Card, Field, Input, cx } from './ui';

/**
 * Weekly planner grid: one row per officer, one column per day. Tap cells to select, then apply
 * a shift preset to all of them at once. Drafts only; published cells are read-only here.
 */
export function RosterGrid({
  site,
  days,
  shifts,
  employees,
  staffing,
  conflicts,
  leaves,
  roving,
  standby,
  onChanged,
  onCopy,
  copying,
}: {
  site: LocationView;
  days: string[];
  shifts: ShiftView[];
  employees: EmployeeView[];
  staffing: StaffingView | null;
  conflicts: ShiftConflict[];
  leaves: LeaveSpan[];
  roving: ShiftView[];
  standby: ShiftView[];
  onChanged: () => Promise<void>;
  onCopy: () => Promise<void>;
  copying: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState(false);
  const [customStart, setCustomStart] = useState(SHIFT_PRESETS.day.start);
  const [customHours, setCustomHours] = useState(String(SHIFT_PRESETS.day.hours));
  const [panel, setPanel] = useState<'autofill' | 'rotation' | null>(null);

  const officers = useMemo(
    () =>
      employees
        .filter((e) => e.status === 'active' && e.legalEntity.id === site.legalEntity.id)
        .sort((a, b) => Number(b.location?.id === site.id) - Number(a.location?.id === site.id)),
    [employees, site],
  );

  // The shift (if any) shown in a cell: one per officer per day in this view. Fixed shifts win
  // over roving ones; roving officers show their zone shift in their own row.
  const cells = useMemo(() => {
    const map = new Map<string, ShiftView>();
    for (const s of [...shifts, ...roving]) {
      const key = `${s.employee.id}::${s.localDate}`;
      if (!map.has(key)) map.set(key, s);
    }
    return map;
  }, [shifts, roving]);

  const requirement = (day: string) =>
    staffing?.requirements.find((r) => r.weekday === isoWeekday(day)) ?? null;

  const conflictByShift = useMemo(() => {
    const map = new Map<string, ShiftConflict['kind'][]>();
    for (const c of conflicts) {
      if (!c.shiftId) continue;
      const list = map.get(c.shiftId) ?? [];
      list.push(c.kind);
      map.set(c.shiftId, list);
    }
    return map;
  }, [conflicts]);

  const weeklyOver = useMemo(
    () => new Set(conflicts.filter((c) => c.kind === 'weekly_hours').map((c) => c.employeeId)),
    [conflicts],
  );

  const leaveDates = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const span of leaves) {
      const set = map.get(span.employeeId) ?? new Set<string>();
      for (let d = span.startDate; d <= span.endDate; d = addDays(d, 1)) {
        if (days.includes(d)) set.add(d);
      }
      map.set(span.employeeId, set);
    }
    return map;
  }, [leaves, days]);

  const keyOf = (employeeId: string, day: string) => `${employeeId}::${day}`;

  function toggle(employeeId: string, day: string, shift: ShiftView | null) {
    if (busy) return;
    if (shift && shift.status !== 'draft') return; // published cells are read-only here
    const key = keyOf(employeeId, day);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function applyPreset(kind: ShiftKind) {
    if (selected.size === 0) return;
    const preset = kind === 'night' ? SHIFT_PRESETS.night : SHIFT_PRESETS.day;
    const startTime = kind === 'custom' ? customStart : preset.start;
    const hours = kind === 'custom' ? Number(customHours) : preset.hours;
    // One all-or-nothing request: each cell's draft is replaced in place, and if any cell fails
    // (a clash, say) nothing changes, so no draft is lost half way.
    const items = [...selected].map((key) => {
      const [employeeId, day] = key.split('::') as [string, string];
      const draft = shifts.find(
        (x) => x.employee.id === employeeId && x.localDate === day && x.status === 'draft',
      );
      return {
        locationId: site.id,
        employeeId,
        date: day,
        startTime,
        durationHours: hours,
        kind,
        ...(draft && { replaceShiftId: draft.id }),
      };
    });
    setBusy(true);
    try {
      await api('/tenant/shifts/batch', { body: { items } });
      setSelected(new Set());
      setCustom(false);
      await onChanged();
    } catch (e) {
      if (!(e instanceof ApiError)) {
        toast.push('error', t.common.error);
        return;
      }
      // Name the cell that failed: the batch was undone, so the planner fixes just that one.
      const failed = typeof e.details.index === 'number' ? items[e.details.index] : undefined;
      const who = failed && employees.find((x) => x.id === failed.employeeId)?.fullName;
      toast.push(
        'error',
        failed && who ? `${who} · ${dayLabel(failed.date)}: ${e.message}` : e.message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      for (const key of selected) {
        const [employeeId, day] = key.split('::') as [string, string];
        for (const s of shifts.filter((x) => x.employee.id === employeeId && x.localDate === day)) {
          if (s.status === 'draft') await api(`/tenant/shifts/${s.id}`, { method: 'DELETE' });
        }
      }
      setSelected(new Set());
      await onChanged();
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : t.common.error);
    } finally {
      setBusy(false);
    }
  }

  const filled = useMemo(
    () =>
      days.map((day) => ({
        day: shifts.filter((s) => s.localDate === day && s.kind === 'day').length,
        night: shifts.filter((s) => s.localDate === day && s.kind === 'night').length,
      })),
    [days, shifts],
  );

  function conflictMessage(c: ShiftConflict): string {
    switch (c.kind) {
      case 'leave':
        return t.schedule.conflictLeave(c.employeeName);
      case 'rest':
        return t.schedule.conflictRest(c.employeeName, c.detail);
      case 'weekly_hours':
        return t.schedule.conflictWeeklyHours(c.employeeName, c.detail);
      case 'consecutive_nights':
        return t.schedule.conflictNights(c.employeeName, c.detail);
      case 'site_not_allowed':
        return t.schedule.conflictSite(c.employeeName);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base text-muted">
          {selected.size > 0 ? `${selected.size} ${t.schedule.shift}` : t.schedule.selectHint}
        </p>
        <div className="flex flex-wrap gap-2">
          {selected.size === 0 && (
            <>
              <Button
                variant="secondary"
                onClick={() => setPanel((p) => (p === 'autofill' ? null : 'autofill'))}
              >
                <Sparkles className="size-5" aria-hidden />
                {t.planning.autofill}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPanel((p) => (p === 'rotation' ? null : 'rotation'))}
              >
                <Repeat className="size-5" aria-hidden />
                {t.planning.rotation}
              </Button>
            </>
          )}
          <Button variant="secondary" loading={copying} onClick={onCopy}>
            <Copy className="size-5" aria-hidden />
            {t.schedule.copyLastWeek}
          </Button>
          {selected.size > 0 && (
            <>
              <Button variant="ghost" onClick={() => setCustom((v) => !v)}>
                {t.schedule.presetCustom}
              </Button>
              <Button variant="ghost" onClick={() => setSelected(new Set())}>
                <X className="size-5" aria-hidden />
                {t.common.cancel}
              </Button>
              <Button variant="danger" loading={busy} onClick={removeSelected}>
                <Eraser className="size-5" aria-hidden />
                {t.common.delete}
              </Button>
            </>
          )}
        </div>
      </div>

      {panel === 'autofill' && selected.size === 0 && (
        <RosterAutofill
          site={site}
          from={days[0]!}
          to={days[days.length - 1]!}
          hasStaffing={(staffing?.requirements.length ?? 0) > 0}
          onApplied={onChanged}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'rotation' && selected.size === 0 && (
        <RotationPanel
          site={site}
          officers={officers.filter((o) => o.assignmentType !== 'roving')}
          monday={days[0]!}
          onApplied={onChanged}
          onClose={() => setPanel(null)}
        />
      )}

      {custom && (
        <Card className="grid gap-4 p-4 sm:grid-cols-[12rem_8rem_auto] sm:items-end">
          <Field label={t.schedule.start} htmlFor="grid-start">
            <Input
              id="grid-start"
              type="time"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </Field>
          <Field label={t.schedule.duration} htmlFor="grid-hours">
            <Input
              id="grid-hours"
              type="number"
              min={1}
              max={24}
              value={customHours}
              onChange={(e) => setCustomHours(e.target.value)}
            />
          </Field>
          <Button loading={busy} onClick={() => applyPreset('custom')}>
            <Plus className="size-5" aria-hidden />
            {t.schedule.saveDraft}
          </Button>
        </Card>
      )}

      {selected.size > 0 && !custom && (
        <div className="flex flex-wrap gap-2">
          <Button loading={busy} onClick={() => applyPreset('day')}>
            {t.schedule.presetDay}
          </Button>
          <Button loading={busy} onClick={() => applyPreset('night')}>
            {t.schedule.presetNight}
          </Button>
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="label flex items-center gap-2 text-muted">
            <AlertTriangle className="size-4 text-accent" aria-hidden />
            {t.schedule.conflictsTitle} ({conflicts.length})
          </h2>
          <ul className="mt-2 space-y-1">
            {conflicts.map((c, i) => (
              <li
                key={`${c.kind}-${c.employeeId}-${c.shiftId ?? c.localDate}-${i}`}
                className="text-sm text-fg"
              >
                {conflictMessage(c)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto">
        <div
          className="grid min-w-[640px] gap-px rounded-2xl border border-line bg-line"
          style={{
            gridTemplateColumns: `minmax(150px, 1fr) repeat(${days.length}, minmax(52px, 1fr))`,
          }}
        >
          <HeaderCell>{t.schedule.need}</HeaderCell>
          {days.map((day) => {
            const r = requirement(day);
            return (
              <HeaderCell key={`need-${day}`}>
                {r ? t.schedule.staffing(r.dayCount, r.nightCount) : '·'}
              </HeaderCell>
            );
          })}

          <HeaderCell>{t.schedule.filled}</HeaderCell>
          {days.map((day, i) => {
            const r = requirement(day);
            const ok = r && filled[i]!.day >= r.dayCount && filled[i]!.night >= r.nightCount;
            return (
              <HeaderCell key={`filled-${day}`} className={cx(!r ? '' : ok ? '' : 'text-accent')}>
                {!r ? '·' : ok ? '✓' : '⚠'}
              </HeaderCell>
            );
          })}

          <HeaderCell />
          {days.map((day) => {
            const d = Number(day.slice(8, 10));
            return (
              <HeaderCell key={`head-${day}`} className="font-semibold">
                <span className="block text-sm">{t.schedule.shortDays[isoWeekday(day) - 1]}</span>
                <span className="block text-lg tabular-nums">{d}</span>
              </HeaderCell>
            );
          })}

          {officers.map((officer) => (
            <OfficerRow
              key={officer.id}
              officer={officer}
              days={days}
              cellFor={(day) => cells.get(keyOf(officer.id, day)) ?? null}
              selected={selected}
              onToggle={(day, shift) => toggle(officer.id, day, shift)}
              conflictByShift={conflictByShift}
              leaveDates={leaveDates}
              weeklyOver={weeklyOver}
            />
          ))}

          <div className="flex items-center gap-2 bg-surface px-3 py-2">
            <p className="text-sm font-semibold text-muted">{t.schedule.standbyRow}</p>
          </div>
          {days.map((day) => {
            const names = standby
              .filter((s) => s.localDate === day)
              .map((s) => s.employee.fullName);
            return (
              <div
                key={day}
                className="min-h-11 bg-surface px-1 py-1.5 text-center text-sm text-fg"
              >
                {names.length ? names.join(' · ') : '—'}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HeaderCell({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cx('bg-surface px-2 py-2 text-center text-sm text-muted', className)}>
      {children}
    </div>
  );
}

function OfficerRow({
  officer,
  days,
  cellFor,
  selected,
  onToggle,
  conflictByShift,
  leaveDates,
  weeklyOver,
}: {
  officer: EmployeeView;
  days: string[];
  cellFor: (day: string) => ShiftView | null;
  selected: Set<string>;
  onToggle: (day: string, shift: ShiftView | null) => void;
  conflictByShift: Map<string, ShiftConflict['kind'][]>;
  leaveDates: Map<string, Set<string>>;
  weeklyOver: Set<string>;
}) {
  const onLeave = (day: string) => leaveDates.get(officer.id)?.has(day) ?? false;
  return (
    <>
      <div className="flex items-center gap-2 bg-surface px-3 py-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate text-base font-semibold text-fg">
            <span className="truncate">{officer.fullName}</span>
            {weeklyOver.has(officer.id) && (
              <AlertTriangle className="size-4 shrink-0 text-accent" aria-hidden />
            )}
          </p>
          <p className="truncate text-sm text-muted">{officer.employeeNo}</p>
        </div>
      </div>
      {days.map((day) => {
        const shift = cellFor(day);
        const key = `${officer.id}::${day}`;
        const isSelected = selected.has(key);
        const conflictKinds = shift ? (conflictByShift.get(shift.id) ?? []) : [];
        return (
          <CellButton
            key={day}
            shift={shift}
            selected={isSelected}
            onLeave={onLeave(day)}
            conflictKinds={conflictKinds}
            onClick={() => onToggle(day, shift)}
            label={`${officer.fullName}, ${day}`}
          />
        );
      })}
    </>
  );
}

function CellButton({
  shift,
  selected,
  onLeave,
  conflictKinds,
  onClick,
  label,
}: {
  shift: ShiftView | null;
  selected: boolean;
  onLeave: boolean;
  conflictKinds: ShiftConflict['kind'][];
  onClick: () => void;
  label: string;
}) {
  const t = useT();
  const short = shift ? shiftKindShort(shift.kind) : null;
  const warned = conflictKinds.length > 0;
  const locked = onLeave && !shift;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      aria-label={label}
      className={cx(
        'relative flex min-h-11 flex-col items-center justify-center gap-0.5 bg-surface px-1 py-1.5 text-center transition-colors',
        !shift && !locked && 'text-faint hover:bg-sunken',
        shift && shift.status === 'draft' && 'text-fg hover:bg-sunken',
        shift && shift.status === 'published' && 'cursor-default',
        locked && 'text-accent',
        selected && 'ring-2 ring-inset ring-accent',
      )}
    >
      {warned && (
        <span className="absolute right-1 top-1 size-1.5 rounded-full bg-accent" aria-hidden />
      )}
      {shift ? (
        <>
          <span
            className={cx('label font-bold', shift.status === 'draft' ? 'text-muted' : 'text-fg')}
          >
            {short}
          </span>
          {shift.zone ? (
            <span className="text-[10px] leading-none text-faint">{shift.zone.name}</span>
          ) : shift.status === 'draft' ? (
            <span className="text-[10px] leading-none text-faint">{t.schedule.draft}</span>
          ) : null}
        </>
      ) : locked ? (
        <span className="label font-bold">{t.schedule.leaveCell}</span>
      ) : (
        <span className="text-lg leading-none">·</span>
      )}
    </button>
  );
}

/** ISO weekday of a YYYY-MM-DD string: 1 = Monday … 7 = Sunday. */
function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}
