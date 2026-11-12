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
  Input,
  PageHeader,
  Select,
  Spinner,
  cx,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { addDays, dayLabel, mondayOf, todayLocal, weekLabel } from '@/lib/dates';
import { usePrincipal } from '@/lib/principal-context';
import { attendanceSummary, SHIFT_LABELS, shiftHours } from '@/lib/shifts';
import { useData } from '@/lib/use-data';

const SITE_KEY = 'xr-roster-site';

export default function RosterPage() {
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
        text: `${result.published} shift terbit. ${result.notified} officer menerima notifikasi.`,
      });
      await roster.reload();
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof ApiError ? e.message : 'Terjadi kesalahan.' });
    } finally {
      setPublishing(false);
    }
  }

  if (sites.error) return <Alert>{sites.error}</Alert>;
  if (!sites.data) return <Spinner />;
  if (activeSites.length === 0) {
    return (
      <>
        <PageHeader title="Jadwal" />
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <CalendarDays className="size-10 text-faint" aria-hidden />
          <h2 className="mt-4 font-display text-xl font-bold">Belum ada site</h2>
          <p className="mt-1 max-w-sm text-base text-muted">
            Tambahkan site terlebih dahulu untuk menyusun jadwal.
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Jadwal"
        description={site ? `${site.name} · ${weekLabel(monday)}` : undefined}
      />
      <div className="mb-6 space-y-4">
        <Field label="Site" htmlFor="site">
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
            aria-label="Minggu sebelumnya"
            onClick={() => setMonday(addDays(monday, -7))}
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => setMonday(mondayOf(today))}>
            Minggu ini
          </Button>
          <Button
            variant="secondary"
            aria-label="Minggu berikutnya"
            onClick={() => setMonday(addDays(monday, 7))}
          >
            <ChevronRight className="size-5" aria-hidden />
          </Button>
        </div>
        {canManage && (
          <Button className="w-full" disabled={drafts === 0} loading={publishing} onClick={publish}>
            <Send className="size-5" aria-hidden />
            {drafts > 0
              ? `Terbitkan ${drafts} shift draft`
              : roster.data?.length
                ? 'Semua shift minggu ini sudah terbit'
                : 'Belum ada shift untuk diterbitkan'}
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
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(shift: ShiftView) {
    const question =
      shift.status === 'published'
        ? `Batalkan shift ${shift.employee.fullName}? Officer akan diberi tahu.`
        : `Hapus draft shift ${shift.employee.fullName}?`;
    if (!window.confirm(question)) return;
    setError(null);
    try {
      await api(`/tenant/shifts/${shift.id}`, { method: 'DELETE' });
      await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan.');
    }
  }

  return (
    <Card className={cx('p-5', isToday && 'border-fg')}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-fg">
          {dayLabel(day)}
          {isToday && <span className="label ml-2 text-accent">Hari ini</span>}
        </h2>
        {employees && !adding && (
          <Button
            variant="ghost"
            className="px-3"
            onClick={() => setAdding(true)}
            aria-label={`Tambah shift ${dayLabel(day)}`}
          >
            <Plus className="size-5" aria-hidden />
            Shift
          </Button>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {shifts.length === 0 && !adding && (
        <p className="mt-2 text-base text-faint">Belum ada shift.</p>
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
                  {SHIFT_LABELS[s.kind]} · {shiftHours(s)}
                </p>
                <AttendanceNote shift={s} />
                <Badge tone={s.status === 'draft' ? 'warn' : 'active'}>
                  {s.status === 'draft' ? 'Draft' : 'Terbit'}
                </Badge>
              </div>
              {employees && (
                <button
                  type="button"
                  onClick={() => remove(s)}
                  aria-label={s.status === 'published' ? 'Batalkan shift' : 'Hapus shift'}
                  className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:text-accent"
                >
                  <Trash2 className="size-5" aria-hidden />
                </button>
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
      setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan.');
      setSaving(false);
    }
  }

  if (candidates.length === 0) {
    return (
      <div className="mt-4 space-y-3">
        <Alert>Belum ada karyawan aktif di legal entity site ini.</Alert>
        <Button variant="secondary" onClick={() => onDone(false)}>
          Tutup
        </Button>
      </div>
    );
  }

  const kinds: { value: ShiftKind; label: string }[] = [
    { value: 'day', label: 'Pagi 08–20' },
    { value: 'night', label: 'Malam 20–08' },
    { value: 'custom', label: 'Khusus' },
  ];
  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      {error && <Alert>{error}</Alert>}
      <Field label="Officer" htmlFor={`officer-${day}`}>
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
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Jenis shift">
        {kinds.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={kind === k.value}
            onClick={() => choose(k.value)}
            className={cx(
              'min-h-12 rounded-lg border px-2 text-sm font-semibold',
              kind === k.value ? 'border-fg bg-fg text-bg' : 'border-control text-fg',
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
      {kind === 'custom' && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Mulai" htmlFor={`start-${day}`}>
            <Input
              id={`start-${day}`}
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Field>
          <Field label="Durasi (jam)" htmlFor={`hours-${day}`}>
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
          Simpan draft
        </Button>
        <Button variant="ghost" onClick={() => onDone(false)}>
          Batal
        </Button>
      </div>
    </div>
  );
}

/** Check-in status of a published shift: present, late, left, or not yet arrived. */
function AttendanceNote({ shift }: { shift: ShiftView }) {
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
  return started ? <p className="text-sm font-semibold text-accent">Belum absen masuk</p> : null;
}
