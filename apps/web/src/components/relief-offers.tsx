'use client';

import type { MyReliefOffer } from '@xrostr/contracts';
import { CalendarPlus, MapPin } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { api, ApiError } from '@/lib/api';
import { dayLabel } from '@/lib/dates';
import { useT } from '@/lib/i18n';
import { localClock, shiftHours } from '@/lib/shifts';
import { Button, Card } from './ui';

const REFRESH_MS = 30_000;

/**
 * Replacement shifts offered to the signed-in officer, each with a large Accept / Decline.
 * Renders nothing when there are none, unless `showEmpty` (the page the push opens).
 */
export function ReliefOffers({ showEmpty = false }: { showEmpty?: boolean }) {
  const t = useT();
  const toast = useToast();
  const [offers, setOffers] = useState<MyReliefOffer[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOffers(await api<MyReliefOffer[]>('/me/relief'));
    } catch {
      // Not an employee, or offline: nothing to answer here.
      setOffers([]);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function answer(offer: MyReliefOffer, accept: boolean) {
    setBusy(offer.id);
    try {
      await api(`/me/relief/${offer.id}/${accept ? 'accept' : 'decline'}`, { method: 'POST' });
      toast.push('success', accept ? t.relief.accepted : t.relief.declined);
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : t.common.error);
    } finally {
      setBusy(null);
      await load();
    }
  }

  if (!offers) return null;
  if (offers.length === 0)
    return showEmpty ? <p className="text-base text-muted">{t.relief.noOffers}</p> : null;

  return (
    <section className="space-y-3" aria-label={t.relief.offersTitle}>
      {offers.map((offer) => (
        <Card key={offer.id} className="space-y-4 border-accent p-5">
          <p className="label flex items-center gap-2 font-bold text-accent">
            <CalendarPlus className="size-5" aria-hidden />
            {t.relief.offersTitle}
          </p>
          <div>
            <p className="text-lg font-semibold text-fg">{dayLabel(offer.localDate)}</p>
            <p className="text-3xl font-bold tracking-tight text-fg tabular-nums">
              {shiftHours(offer)}
            </p>
            <p className="mt-2 flex items-center gap-2 text-base text-fg">
              <MapPin className="size-5 shrink-0 text-muted" aria-hidden />
              {offer.location.name}
            </p>
          </div>
          {offer.expiresAt && (
            <p className="text-base text-muted">
              {t.relief.answerBy(localClock(offer.expiresAt, offer.timezone))}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Button
              className="min-h-14 text-base"
              loading={busy === offer.id}
              disabled={busy !== null}
              onClick={() => answer(offer, true)}
            >
              {t.relief.accept}
            </Button>
            <Button
              variant="secondary"
              className="min-h-14 text-base"
              disabled={busy !== null}
              onClick={() => answer(offer, false)}
            >
              {t.relief.decline}
            </Button>
          </div>
        </Card>
      ))}
    </section>
  );
}
