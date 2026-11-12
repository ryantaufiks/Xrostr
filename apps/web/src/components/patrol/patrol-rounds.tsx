'use client';

import type { LocationView, PatrolRoundView } from '@xrostr/contracts';
import { useState } from 'react';
import { todayLocal } from '@/lib/dates';
import { useT } from '@/lib/i18n';
import { localClock } from '@/lib/shifts';
import { useData } from '@/lib/use-data';
import { Alert, Badge, Card, Field, Input, Spinner, cx } from '../ui';
import { ProgressDots } from './progress-dots';

/** Rounds at one site on one day: who walked which route, and what was missed or flagged. */
export function PatrolRounds({ site }: { site: LocationView }) {
  const t = useT();
  const [date, setDate] = useState(todayLocal);
  const rounds = useData<PatrolRoundView[]>(
    `/tenant/patrol/rounds?locationId=${site.id}&from=${date}&to=${date}`,
  );

  return (
    <section className="space-y-4" aria-labelledby="rounds">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="rounds" className="font-display text-2xl font-bold">
          {t.patrol.roundsTitle}
        </h2>
        <div className="w-48">
          <Field label={t.patrol.date} htmlFor="rounds-date">
            <Input
              id="rounds-date"
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </Field>
        </div>
      </div>
      {rounds.error && <Alert>{rounds.error}</Alert>}
      {!rounds.data && !rounds.error && <Spinner />}
      {rounds.data?.length === 0 && <p className="text-base text-muted">{t.patrol.noRounds}</p>}
      {rounds.data && rounds.data.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {rounds.data.map((round) => {
              const flagged = round.scans.filter((s) => s.locationVerified === false).length;
              const time = (iso: string) => localClock(iso, site.timezone);
              return (
                <li key={round.id} className="space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold text-fg">{round.employee.fullName}</p>
                      <p className="text-base text-muted">
                        {round.route.name} · {time(round.startedAt)}
                        {round.finishedAt && `–${time(round.finishedAt)}`}
                      </p>
                    </div>
                    <Badge
                      tone={
                        round.status === 'completed'
                          ? 'active'
                          : round.status === 'incomplete'
                            ? 'warn'
                            : 'neutral'
                      }
                    >
                      {t.patrol.statuses[round.status]}
                    </Badge>
                  </div>
                  <ProgressDots
                    scanned={round.scans.length}
                    total={round.total}
                    className="mt-2 justify-start"
                  />
                  <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {round.scans.map((s) => (
                      <li
                        key={s.checkpointId}
                        className={cx(
                          s.locationVerified === false ? 'font-semibold text-accent' : 'text-muted',
                        )}
                      >
                        {time(s.scannedAt)} {s.name}
                        {s.locationVerified === false && ` (${s.distanceM} m)`}
                        {s.locationVerified === null && ` · ${t.patrol.noGps}`}
                      </li>
                    ))}
                  </ol>
                  {round.missed.length > 0 && (
                    <p className="text-sm font-semibold text-accent">
                      {t.patrol.missed(round.missed.join(', '))}
                    </p>
                  )}
                  {flagged > 0 && (
                    <p className="text-sm text-accent">{t.patrol.flagged(flagged)}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
}
