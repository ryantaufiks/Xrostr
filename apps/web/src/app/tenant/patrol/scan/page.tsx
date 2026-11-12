'use client';

import type { PatrolScanResult } from '@xrostr/contracts';
import { CheckCircle2, MapPin, MapPinOff, ScanLine, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ProgressDots } from '@/components/patrol/progress-dots';
import { Button, Card, Spinner, buttonStyles, cx } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { positionIfAvailable } from '@/lib/checkin';
import { useT } from '@/lib/i18n';

type State =
  | { step: 'sending' }
  | { step: 'done'; result: PatrolScanResult }
  | { step: 'failed'; message: string };

/** Records one checkpoint scan, then shows the round's progress and the next checkpoint. */
function PatrolScan() {
  const t = useT();
  const tag = useSearchParams().get('k');
  const [state, setState] = useState<State>({ step: 'sending' });
  const started = useRef(false);

  const run = useCallback(async () => {
    if (!tag) {
      setState({ step: 'failed', message: t.patrol.incompleteTag });
      return;
    }
    setState({ step: 'sending' });
    try {
      // Position is evidence, not a gate: a scan in a basement still counts.
      const position = await positionIfAvailable();
      const result = await api<PatrolScanResult>('/me/patrol/scans', {
        body: { tag, ...position },
      });
      setState({ step: 'done', result });
    } catch (e) {
      setState({ step: 'failed', message: e instanceof ApiError ? e.message : t.common.error });
    }
  }, [tag, t]);

  useEffect(() => {
    // One scan, one attempt: never record twice on a re-render.
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  if (state.step === 'sending') return <Spinner label={t.patrol.recording} />;

  if (state.step === 'failed') {
    return (
      <div className="space-y-6">
        <Card className="flex flex-col items-center px-6 py-10 text-center">
          <ShieldAlert className="size-14 text-accent" aria-hidden />
          <h1 className="mt-4 text-2xl font-bold text-fg">{t.patrol.notRecorded}</h1>
          <p className="mt-2 max-w-sm text-lg text-muted">{state.message}</p>
        </Card>
        <div className="grid gap-3">
          <Button onClick={() => void run()}>{t.common.retry}</Button>
          <Link href="/tenant/patrol" className={buttonStyles('secondary')}>
            {t.patrol.backToPatrol}
          </Link>
        </div>
      </div>
    );
  }

  const { result } = state;
  const { round } = result;
  const complete = round.status === 'completed';
  return (
    <div className="space-y-6">
      <Card className="flex flex-col items-center px-6 py-10 text-center">
        <CheckCircle2 className="size-16 text-fg" aria-hidden />
        <p className="label mt-4 font-bold text-muted">
          {result.alreadyScanned ? t.patrol.alreadyScanned : t.patrol.recorded}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-fg">{result.checkpoint.name}</h1>
        <p className="mt-1 text-base text-muted">
          {round.route.name} · {round.locationName}
        </p>
        <LocationNote result={result} />
        <ProgressDots scanned={round.scanned} total={round.total} />
        <p className="mt-3 text-lg font-semibold text-fg">
          {complete ? t.patrol.roundComplete : t.patrol.progress(round.scanned, round.total)}
        </p>
        {round.next && (
          <p className="mt-1 text-base text-muted">{t.patrol.next(round.next.name)}</p>
        )}
      </Card>
      <div className="grid gap-3">
        {!complete && (
          <Link href="/tenant/scan" className={buttonStyles('primary', 'w-full text-base')}>
            <ScanLine className="size-6" aria-hidden />
            {t.patrol.scanNext}
          </Link>
        )}
        <Link
          href="/tenant/patrol"
          className={buttonStyles(complete ? 'primary' : 'secondary', 'w-full')}
        >
          {t.patrol.backToPatrol}
        </Link>
      </div>
    </div>
  );
}

function LocationNote({ result }: { result: PatrolScanResult }) {
  const t = useT();
  if (result.locationVerified === null)
    return <p className="mt-3 text-sm text-faint">{t.patrol.locationUnknown}</p>;
  const ok = result.locationVerified;
  const Icon = ok ? MapPin : MapPinOff;
  return (
    <p
      className={cx(
        'mt-3 flex items-center gap-1.5 text-base',
        ok ? 'text-muted' : 'font-semibold text-accent',
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      {ok ? t.patrol.locationOk : t.patrol.locationFar(result.distanceM ?? 0)}
    </p>
  );
}

export default function PatrolScanPage() {
  return (
    <Suspense>
      <div className="mx-auto max-w-md">
        <PatrolScan />
      </div>
    </Suspense>
  );
}
