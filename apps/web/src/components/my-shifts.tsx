'use client';

import type { ShiftView } from '@xrostr/contracts';
import { CalendarCheck, MapPin, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { addDays, dayLabel, todayLocal } from '@/lib/dates';
import { SHIFT_LABELS, shiftHours } from '@/lib/shifts';
import { Alert, Card, Spinner, cx } from './ui';

const DAYS_AHEAD = 14;

/** The signed-in person's published shifts for the next two weeks, today first. */
export function MyShifts() {
  const [shifts, setShifts] = useState<ShiftView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notEmployee, setNotEmployee] = useState(false);
  const today = todayLocal();
  const tomorrow = addDays(today, 1);

  useEffect(() => {
    api<ShiftView[]>(`/me/shifts?from=${today}&to=${addDays(today, DAYS_AHEAD - 1)}`)
      .then(setShifts)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.code === 'not_an_employee') setNotEmployee(true);
        else setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan.');
      });
  }, [today]);

  if (notEmployee) return null;
  if (error) return <Alert>{error}</Alert>;
  if (!shifts) return <Spinner label="Memuat jadwal…" />;

  if (shifts.length === 0) {
    return (
      <Card className="flex flex-col items-center px-6 py-12 text-center">
        <CalendarCheck className="size-10 text-faint" aria-hidden />
        <p className="mt-4 text-lg font-semibold text-fg">Belum ada jadwal</p>
        <p className="mt-1 max-w-sm text-base text-muted">
          Jadwal 2 minggu ke depan akan tampil di sini setelah diterbitkan supervisor.
        </p>
      </Card>
    );
  }

  return (
    <section className="space-y-3" aria-label="Jadwal saya">
      {shifts.map((s) => {
        const when = s.localDate === today ? 'Hari ini' : s.localDate === tomorrow ? 'Besok' : null;
        const Icon = s.kind === 'night' ? Moon : Sun;
        return (
          <Card key={s.id} className={cx('p-5', when === 'Hari ini' && 'border-fg')}>
            <p className="label font-bold text-muted">
              {when && <span className="mr-2 text-accent">{when}</span>}
              {dayLabel(s.localDate)}
            </p>
            <div className="mt-3 flex items-center gap-4">
              <Icon className="size-8 shrink-0 text-fg" aria-hidden />
              <div>
                {/* Plain bold digits: a dot-matrix face makes "20.00" hard to read at a glance. */}
                <p className="text-3xl font-bold tracking-tight text-fg tabular-nums">
                  {shiftHours(s)}
                </p>
                <p className="text-base text-muted">{SHIFT_LABELS[s.kind]}</p>
              </div>
            </div>
            <p className="mt-3 flex items-center gap-2 text-base text-fg">
              <MapPin className="size-5 shrink-0 text-muted" aria-hidden />
              {s.location.name}
            </p>
          </Card>
        );
      })}
    </section>
  );
}
