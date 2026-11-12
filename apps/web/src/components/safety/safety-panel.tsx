'use client';

import type { AlertView, MySafety } from '@xrostr/contracts';
import { ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { positionIfAvailable } from '@/lib/checkin';
import { useT } from '@/lib/i18n';
import { intlLocale } from '@/lib/i18n/state';
import { Alert, Button, Card } from '../ui';
import { SosButton } from './sos-button';

const REFRESH_MS = 30_000;

/**
 * The officer's safety controls: answer a pending "are you OK?" check, and the SOS button with
 * the state of their latest SOS. Hidden for accounts without an employee record.
 */
export function SafetyPanel({
  sections = ['check', 'sos'],
  showEmptyCheck = false,
}: {
  /** Which parts to show, so a page can put the question on top and the SOS button below. */
  sections?: ('check' | 'sos')[];
  showEmptyCheck?: boolean;
}) {
  const t = useT();
  const [state, setState] = useState<MySafety | null>(null);
  const [notEmployee, setNotEmployee] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answering, setAnswering] = useState(false);
  const [sending, setSending] = useState(false);
  const [thanked, setThanked] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await api<MySafety>('/me/safety'));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_an_employee') setNotEmployee(true);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function answer(id: string) {
    setAnswering(true);
    setError(null);
    try {
      const position = await positionIfAvailable(5_000);
      await api(`/me/welfare/${id}/respond`, { body: { ...position } });
      setThanked(true);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.common.error);
    } finally {
      setAnswering(false);
    }
  }

  async function sos() {
    setSending(true);
    setError(null);
    try {
      // Send at once with whatever position the phone has quickly; help should not wait on GPS.
      const position = await positionIfAvailable(5_000);
      const alert = await api<AlertView>('/me/sos', { body: { ...position } });
      setState((s) => (s ? { ...s, sos: alert } : s));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.common.error);
    } finally {
      setSending(false);
    }
  }

  if (notEmployee || !state) return null;
  const sosText =
    state.sos?.status === 'acknowledged'
      ? state.sos.acknowledgedBy
        ? t.safety.sosAcknowledged(state.sos.acknowledgedBy)
        : t.safety.sosAcknowledgedAnon
      : state.sos
        ? t.safety.sosSent
        : null;

  return (
    <section className="space-y-4" aria-label={t.safety.title}>
      {error && <Alert>{error}</Alert>}
      {sections.includes('check') && state.check && (
        <Card className="space-y-4 border-accent p-5">
          <p className="font-display text-2xl font-bold text-fg">{t.safety.checkTitle}</p>
          <p className="text-base text-muted">
            {t.safety.checkHint(
              new Date(state.check.respondBy).toLocaleTimeString(intlLocale(), {
                hour: '2-digit',
                minute: '2-digit',
              }),
            )}
          </p>
          <Button
            className="min-h-16 w-full text-lg"
            loading={answering}
            onClick={() => answer(state.check!.id)}
          >
            <ShieldCheck className="size-7" aria-hidden />
            {t.safety.imOk}
          </Button>
        </Card>
      )}
      {sections.includes('check') && !state.check && thanked && (
        <Alert tone="success">{t.safety.thanks}</Alert>
      )}
      {sections.includes('check') && !state.check && !thanked && showEmptyCheck && (
        <p className="text-base text-muted">{t.safety.noCheck}</p>
      )}
      {sections.includes('sos') && (
        <Card className="flex flex-col items-center gap-4 p-6 text-center">
          <p className="label font-bold text-muted">{t.safety.sosTitle}</p>
          <SosButton onTrigger={sos} busy={sending} />
          <p
            className={
              sosText ? 'text-base font-semibold text-accent' : 'max-w-xs text-sm text-muted'
            }
          >
            {sending ? t.safety.sosSending : (sosText ?? t.safety.sosHint)}
          </p>
        </Card>
      )}
    </section>
  );
}
