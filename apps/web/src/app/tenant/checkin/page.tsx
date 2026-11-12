'use client';

import type { AttendanceResult } from '@xrostr/contracts';
import { CheckCircle2, Footprints, LogIn, LogOut, MapPinOff, ScanLine } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Spinner, buttonStyles } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { currentPosition } from '@/lib/checkin';
import { dayLabel } from '@/lib/dates';
import { intlLocale } from '@/lib/i18n/state';
import { localClock, shiftHours } from '@/lib/shifts';
import { useT } from '@/lib/i18n';

type State =
  | { step: 'locating' }
  | { step: 'sending' }
  | { step: 'done'; result: AttendanceResult }
  | { step: 'failed'; message: string; distance?: { distanceM: number; radiusM: number } };

function Checkin() {
  const t = useT();
  const params = useSearchParams();
  const locationId = params.get('l');
  const code = params.get('c');
  const [state, setState] = useState<State>({ step: 'locating' });
  const started = useRef(false);
  /** Retry repeats what failed, a plain scan or an explicit check-out. */
  const lastAction = useRef<'check_out' | undefined>(undefined);

  const run = useCallback(
    async (action?: 'check_out') => {
      lastAction.current = action;
      if (!locationId || !code) {
        setState({ step: 'failed', message: t.attendance.incompleteQr });
        return;
      }
      setState({ step: 'locating' });
      try {
        const position = await currentPosition();
        setState({ step: 'sending' });
        const result = await api<AttendanceResult>('/me/attendance', {
          body: { locationId, code, ...position, ...(action && { action }) },
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
            message: e instanceof Error ? e.message : t.common.error,
          });
        }
      }
    },
    [code, locationId],
  );

  useEffect(() => {
    // One scan, one attempt: never record twice on a re-render.
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  if (state.step === 'locating') return <Spinner label={t.attendance.locating} />;
  if (state.step === 'sending') return <Spinner label={t.attendance.sending} />;

  if (state.step === 'failed') {
    return (
      <div className="space-y-6">
        <Card className="flex flex-col items-center px-6 py-10 text-center">
          <MapPinOff className="size-14 text-accent" aria-hidden />
          <h1 className="mt-4 text-2xl font-bold text-fg">{t.attendance.notRecorded}</h1>
          <p className="mt-2 max-w-sm text-lg text-muted">{state.message}</p>
          {state.distance && (
            <p className="mt-3 text-base text-fg">
              {t.attendance.distance(
                state.distance.distanceM.toLocaleString(intlLocale()),
                state.distance.radiusM,
              )}
            </p>
          )}
        </Card>
        <div className="grid gap-3">
          <Button onClick={() => void run(lastAction.current)}>{t.common.retry}</Button>
          <Link href="/tenant/scan" className={buttonStyles('secondary')}>
            <ScanLine className="size-5" aria-hidden />
            {t.attendance.rescan}
          </Link>
        </div>
      </div>
    );
  }

  const { result } = state;
  const isIn = result.kind === 'check_in';
  const isVisit = result.kind === 'visit';
  const Icon = isVisit ? Footprints : isIn ? LogIn : LogOut;
  return (
    <div className="space-y-6">
      <Card className="flex flex-col items-center px-6 py-10 text-center">
        <CheckCircle2 className="size-16 text-fg" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold text-fg">
          {isVisit
            ? t.visits.visitRecorded
            : isIn
              ? t.attendance.checkedIn
              : t.attendance.checkedOut}
        </h1>
        <p className="mt-3 text-5xl font-bold tracking-tight text-fg tabular-nums">
          {localClock(result.occurredAt, result.shift.timezone)}
        </p>
        {isIn && (
          <p
            className={
              result.lateMinutes
                ? 'mt-3 text-lg font-semibold text-accent'
                : 'mt-3 text-lg text-muted'
            }
          >
            {result.lateMinutes ? t.attendance.lateBy(result.lateMinutes) : t.attendance.onTime}
          </p>
        )}
        {isVisit && <p className="mt-3 max-w-sm text-lg text-muted">{t.visits.visitHint}</p>}
        <div className="mt-6 flex items-center gap-2 text-base text-muted">
          <Icon className="size-5" aria-hidden />
          {result.shift.locationName} · {dayLabel(result.shift.localDate)} ·{' '}
          {shiftHours(result.shift)}
        </div>
      </Card>
      <div className="grid gap-3">
        <Link href="/tenant" className={buttonStyles('primary', 'w-full')}>
          {t.attendance.backToSchedule}
        </Link>
        {isVisit && (
          <Button variant="secondary" onClick={() => void run('check_out')}>
            <LogOut className="size-5" aria-hidden />
            {t.visits.endShift}
          </Button>
        )}
      </div>
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
