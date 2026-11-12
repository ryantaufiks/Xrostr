'use client';

import type { AttendanceResult } from '@xrostr/contracts';
import { CheckCircle2, LogIn, LogOut, MapPinOff, ScanLine } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Spinner, buttonStyles } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { currentPosition } from '@/lib/checkin';
import { dayLabel } from '@/lib/dates';
import { shiftHours } from '@/lib/shifts';

type State =
  | { step: 'locating' }
  | { step: 'sending' }
  | { step: 'done'; result: AttendanceResult }
  | { step: 'failed'; message: string; distance?: { distanceM: number; radiusM: number } };

/** Clock time at the site, not on the phone: both read the same on a WIB phone in Bali. */
const clock = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

function Checkin() {
  const params = useSearchParams();
  const locationId = params.get('l');
  const code = params.get('c');
  const [state, setState] = useState<State>({ step: 'locating' });
  const started = useRef(false);

  const run = useCallback(async () => {
    if (!locationId || !code) {
      setState({ step: 'failed', message: 'QR tidak lengkap. Pindai ulang poster QR di lokasi.' });
      return;
    }
    setState({ step: 'locating' });
    try {
      const position = await currentPosition();
      setState({ step: 'sending' });
      const result = await api<AttendanceResult>('/me/attendance', {
        body: { locationId, code, ...position },
      });
      setState({ step: 'done', result });
    } catch (e) {
      if (e instanceof ApiError) {
        const d = e.details as { distanceM?: number; radiusM?: number };
        setState({
          step: 'failed',
          message: e.message,
          distance:
            d.distanceM != null && d.radiusM != null
              ? { distanceM: d.distanceM, radiusM: d.radiusM }
              : undefined,
        });
      } else {
        setState({
          step: 'failed',
          message: e instanceof Error ? e.message : 'Terjadi kesalahan.',
        });
      }
    }
  }, [code, locationId]);

  useEffect(() => {
    // One scan, one attempt: never record twice on a re-render.
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  if (state.step === 'locating') return <Spinner label="Membaca lokasi Anda…" />;
  if (state.step === 'sending') return <Spinner label="Mencatat absensi…" />;

  if (state.step === 'failed') {
    return (
      <div className="space-y-6">
        <Card className="flex flex-col items-center px-6 py-10 text-center">
          <MapPinOff className="size-14 text-accent" aria-hidden />
          <h1 className="mt-4 text-2xl font-bold text-fg">Absensi belum tercatat</h1>
          <p className="mt-2 max-w-sm text-lg text-muted">{state.message}</p>
          {state.distance && (
            <p className="mt-3 text-base text-fg">
              Jarak Anda {state.distance.distanceM.toLocaleString('id-ID')} m · batas{' '}
              {state.distance.radiusM} m
            </p>
          )}
        </Card>
        <div className="grid gap-3">
          <Button onClick={() => void run()}>Coba lagi</Button>
          <Link href="/tenant/scan" className={buttonStyles('secondary')}>
            <ScanLine className="size-5" aria-hidden />
            Pindai ulang QR
          </Link>
        </div>
      </div>
    );
  }

  const { result } = state;
  const isIn = result.kind === 'check_in';
  const Icon = isIn ? LogIn : LogOut;
  return (
    <div className="space-y-6">
      <Card className="flex flex-col items-center px-6 py-10 text-center">
        <CheckCircle2 className="size-16 text-fg" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold text-fg">
          {isIn ? 'Absen masuk tercatat' : 'Absen pulang tercatat'}
        </h1>
        <p className="mt-3 text-5xl font-bold tracking-tight text-fg tabular-nums">
          {clock(result.occurredAt, result.shift.timezone).replace(':', '.')}
        </p>
        {isIn && (
          <p
            className={
              result.lateMinutes
                ? 'mt-3 text-lg font-semibold text-accent'
                : 'mt-3 text-lg text-muted'
            }
          >
            {result.lateMinutes ? `Terlambat ${result.lateMinutes} menit` : 'Tepat waktu'}
          </p>
        )}
        <div className="mt-6 flex items-center gap-2 text-base text-muted">
          <Icon className="size-5" aria-hidden />
          {result.shift.locationName} · {dayLabel(result.shift.localDate)} ·{' '}
          {shiftHours(result.shift)}
        </div>
      </Card>
      <Link href="/tenant" className={buttonStyles('primary', 'w-full')}>
        Kembali ke jadwal
      </Link>
    </div>
  );
}

export default function CheckinPage() {
  return (
    <Suspense>
      <div className="mx-auto max-w-md">
        <Checkin />
      </div>
    </Suspense>
  );
}
