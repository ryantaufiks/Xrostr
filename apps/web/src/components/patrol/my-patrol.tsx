'use client';

import type { MyPatrol, PatrolProgress } from '@xrostr/contracts';
import { Route, ScanLine } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { localClock, shiftHours } from '@/lib/shifts';
import { Alert, Button, Card, Spinner, buttonStyles } from '../ui';
import { ProgressDots } from './progress-dots';

/** The officer's patrol routes for the shift they are on, with the round in progress. */
export function MyPatrolSection() {
  const t = useT();
  const [data, setData] = useState<MyPatrol | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notEmployee, setNotEmployee] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<MyPatrol>('/me/patrol'));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_an_employee') setNotEmployee(true);
      else setError(e instanceof ApiError ? e.message : t.common.error);
    }
  }, [t]);
  useEffect(() => void load(), [load]);

  async function finish(round: PatrolProgress) {
    if (!confirm(t.patrol.finishConfirm)) return;
    try {
      await api(`/me/patrol/rounds/${round.roundId}/finish`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.common.error);
    }
  }

  if (notEmployee) return null;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;

  return (
    <section className="space-y-4" aria-labelledby="my-patrol">
      <h2 id="my-patrol" className="font-display text-2xl font-bold">
        {t.patrol.myTitle}
      </h2>
      {!data.shift ? (
        <p className="text-base text-muted">{t.patrol.noShift}</p>
      ) : (
        <>
          <p className="text-base text-muted">
            {t.patrol.shiftAt(data.shift.locationName, shiftHours(data.shift))}
          </p>
          <Link
            href="/tenant/scan"
            className={buttonStyles('primary', 'w-full text-base sm:w-auto')}
          >
            <ScanLine className="size-6" aria-hidden />
            {t.patrol.scanCheckpoint}
          </Link>
          {data.routes.length === 0 && <p className="text-base text-muted">{t.patrol.noRoutes}</p>}
          {data.routes.map(({ route, checkpoints, round, lastFinishedAt }) => (
            <Card key={route.id} className="p-5">
              <div className="flex items-start gap-3">
                <Route className="mt-1 size-6 shrink-0 text-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold text-fg">{route.name}</p>
                  {route.intervalMinutes && (
                    <p className="text-sm text-muted">
                      {t.patrol.everyMinutes(route.intervalMinutes)}
                    </p>
                  )}
                </div>
              </div>
              {round ? (
                <>
                  <ProgressDots
                    scanned={round.scanned}
                    total={round.total}
                    className="justify-start"
                  />
                  <p className="mt-3 text-base font-semibold text-fg">
                    {t.patrol.progress(round.scanned, round.total)}
                  </p>
                  {round.next && (
                    <p className="text-base text-muted">{t.patrol.next(round.next.name)}</p>
                  )}
                  <Button variant="secondary" className="mt-4" onClick={() => finish(round)}>
                    {t.patrol.finishRound}
                  </Button>
                </>
              ) : (
                <p className="mt-3 text-base text-muted">
                  {checkpoints.length > 0 ? t.patrol.notStarted : t.patrol.noRoutes}
                </p>
              )}
              {lastFinishedAt && (
                <p className="mt-3 text-sm text-faint">
                  {t.patrol.lastRound(localClock(lastFinishedAt, data.shift!.timezone))}
                </p>
              )}
            </Card>
          ))}
        </>
      )}
    </section>
  );
}
