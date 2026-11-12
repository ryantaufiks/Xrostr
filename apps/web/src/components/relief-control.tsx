'use client';

import type { ReliefCandidate, ReliefRequestView, ShiftView } from '@xrostr/contracts';
import { UserRoundSearch } from 'lucide-react';
import { useState } from 'react';
import { useConfirm } from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { localClock } from '@/lib/shifts';
import { Alert, Badge, Button, Select, Spinner, cx } from './ui';

const TIMEOUTS = [10, 15, 30] as const;

/**
 * Relief for one published shift: shows the search in progress or its outcome, or lets the
 * planner pick candidates (pre-selected in the suggested order) and send the offers.
 */
export function ReliefControl({
  shift,
  request,
  onChanged,
}: {
  shift: ShiftView;
  /** The latest relief search of this shift, if any. */
  request: ReliefRequestView | undefined;
  onChanged: () => Promise<void>;
}) {
  const t = useT();
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [candidates, setCandidates] = useState<ReliefCandidate[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [timeout, setTimeoutMinutes] = useState<number>(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const failure = (e: unknown) => (e instanceof ApiError ? e.message : t.common.error);

  if (request?.status === 'open') {
    const current = request.offers.find((o) => o.status === 'offered');
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-accent">
          {current?.expiresAt
            ? t.relief.offeringTo(
                current.employee.fullName,
                localClock(current.expiresAt, request.timezone),
              )
            : t.relief.searching}
        </p>
        <Button
          variant="ghost"
          className="min-h-11 px-0"
          onClick={async () => {
            if (
              !(await confirm({
                message: t.relief.cancelConfirm,
                confirmLabel: t.relief.cancelSearch,
              }))
            )
              return;
            try {
              await api(`/tenant/relief/${request.id}/cancel`, { method: 'POST' });
              await onChanged();
            } catch (e) {
              toast.push('error', failure(e));
            }
          }}
        >
          {t.relief.cancelSearch}
        </Button>
        {confirmDialog}
      </div>
    );
  }

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const list = await api<ReliefCandidate[]>(`/tenant/shifts/${shift.id}/relief/candidates`);
      setCandidates(list);
      // Suggested order, without anyone who would go over the weekly limit.
      setChosen(list.filter((c) => !c.overWeeklyLimit).map((c) => c.employee.id));
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const order = candidates!.map((c) => c.employee.id).filter((id) => chosen.includes(id));
      await api(`/tenant/shifts/${shift.id}/relief`, {
        body: { employeeIds: order, timeoutMinutes: timeout },
      });
      toast.push('success', t.relief.sent);
      setCandidates(null);
      await onChanged();
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {request?.status === 'filled' && request.filledBy && (
        <p className="text-sm text-muted">{t.relief.filledBy(request.filledBy.fullName)}</p>
      )}
      {request?.status === 'unfilled' && (
        <p className="text-sm font-semibold text-accent">{t.relief.unfilled}</p>
      )}
      {error && <Alert>{error}</Alert>}
      {!candidates && (
        <Button variant="secondary" loading={busy} onClick={load}>
          <UserRoundSearch className="size-5" aria-hidden />
          {t.relief.find}
        </Button>
      )}
      {candidates && (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <p className="label font-bold text-fg">{t.relief.candidatesTitle}</p>
          <p className="text-sm text-muted">{t.relief.candidatesHint}</p>
          {busy && candidates.length === 0 && <Spinner />}
          {candidates.length === 0 ? (
            <p className="text-base text-muted">{t.relief.noCandidates}</p>
          ) : (
            <ol className="space-y-2">
              {candidates.map((c, i) => (
                <li key={c.employee.id}>
                  <label className="flex min-h-11 items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-5"
                      checked={chosen.includes(c.employee.id)}
                      onChange={(e) =>
                        setChosen((list) =>
                          e.target.checked
                            ? [...list, c.employee.id]
                            : list.filter((id) => id !== c.employee.id),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-fg">
                        {i + 1}. {c.employee.fullName}
                      </span>
                      <span
                        className={cx(
                          'block text-sm',
                          c.overWeeklyLimit ? 'text-accent' : 'text-muted',
                        )}
                      >
                        {t.relief.weeklyHours(c.weeklyHours)}
                        {c.overWeeklyLimit && ` · ${t.relief.overLimit}`}
                      </span>
                    </span>
                    <Badge tone={c.priority === 'roving' ? 'active' : 'neutral'}>
                      {t.relief.priorities[c.priority]}
                    </Badge>
                  </label>
                </li>
              ))}
            </ol>
          )}
          {candidates.length > 0 && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1">
                <span className="label block font-bold text-muted">{t.relief.timeout}</span>
                <Select
                  className="w-40"
                  value={timeout}
                  onChange={(e) => setTimeoutMinutes(Number(e.target.value))}
                >
                  {TIMEOUTS.map((m) => (
                    <option key={m} value={m}>
                      {t.relief.minutes(m)}
                    </option>
                  ))}
                </Select>
              </label>
              <Button loading={busy} disabled={chosen.length === 0} onClick={send}>
                {t.relief.send}
              </Button>
              <Button variant="ghost" onClick={() => setCandidates(null)}>
                {t.common.cancel}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
