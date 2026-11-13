'use client';

import {
  SHIFT_PRESETS,
  type LocationView,
  type RosterSuggestion,
  type RosterSuggestionsView,
} from '@xrostr/contracts';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { api, ApiError } from '@/lib/api';
import { dayLabel } from '@/lib/dates';
import { useT } from '@/lib/i18n';
import { Alert, Button, Card, Spinner } from './ui';

const keyOf = (s: RosterSuggestion) => `${s.date}::${s.kind}::${s.employee.id}`;

/**
 * Suggestions to bring the week up to the site's staffing need. The planner unticks any they
 * do not want and applies the rest as drafts in one all-or-nothing batch.
 */
export function RosterAutofill({
  site,
  from,
  to,
  hasStaffing,
  onApplied,
  onClose,
}: {
  site: LocationView;
  from: string;
  to: string;
  hasStaffing: boolean;
  onApplied: () => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [view, setView] = useState<RosterSuggestionsView | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = `/tenant/roster/suggestions?locationId=${site.id}&from=${from}&to=${to}`;
  useEffect(() => {
    if (!hasStaffing) return;
    let live = true;
    setLoading(true);
    setError(null);
    api<RosterSuggestionsView>(query)
      .then((v) => {
        if (!live) return;
        setView(v);
        setChosen(new Set(v.suggestions.map(keyOf)));
      })
      .catch((e: unknown) => live && setError(e instanceof ApiError ? e.message : t.common.error))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [query, hasStaffing, t.common.error]);

  async function apply() {
    if (!view) return;
    const picked = view.suggestions.filter((s) => chosen.has(keyOf(s)));
    if (picked.length === 0) return;
    setApplying(true);
    setError(null);
    try {
      await api('/tenant/shifts/batch', {
        body: {
          items: picked.map((s) => ({
            locationId: site.id,
            employeeId: s.employee.id,
            date: s.date,
            startTime: SHIFT_PRESETS[s.kind].start,
            durationHours: SHIFT_PRESETS[s.kind].hours,
            kind: s.kind,
          })),
        },
      });
      toast.push('success', t.planning.applied(picked.length));
      await onApplied();
      onClose();
    } catch (e) {
      if (!(e instanceof ApiError)) setError(t.common.error);
      else {
        const failed = typeof e.details.index === 'number' ? picked[e.details.index] : undefined;
        setError(
          failed
            ? `${failed.employee.fullName} · ${dayLabel(failed.date)}: ${e.message}`
            : e.message,
        );
      }
    } finally {
      setApplying(false);
    }
  }

  // Map.groupBy is not in every phone's browser yet: group by hand.
  const byDate = new Map<string, RosterSuggestion[]>();
  for (const s of view?.suggestions ?? []) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const short = view?.unfilled.reduce((n, u) => n + u.missing, 0) ?? 0;

  return (
    <Card className="space-y-4 p-4">
      <div>
        <p className="label font-bold text-fg">{t.planning.autofillTitle}</p>
        <p className="mt-1 text-sm text-muted">{t.planning.autofillHint}</p>
      </div>
      {!hasStaffing && <p className="text-base text-muted">{t.planning.noStaffing}</p>}
      {error && <Alert>{error}</Alert>}
      {loading && <Spinner />}
      {view && view.suggestions.length === 0 && short === 0 && (
        <p className="text-base text-muted">{t.planning.nothingToFill}</p>
      )}
      {view && byDate.size > 0 && (
        <ul className="space-y-3">
          {[...byDate].map(([date, list]) => (
            <li key={date}>
              <p className="text-sm font-semibold text-muted">{dayLabel(date)}</p>
              <ul className="mt-1 space-y-1">
                {list.map((s) => (
                  <li key={keyOf(s)}>
                    <label className="flex min-h-11 items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-5"
                        checked={chosen.has(keyOf(s))}
                        onChange={(e) =>
                          setChosen((current) => {
                            const next = new Set(current);
                            if (e.target.checked) next.add(keyOf(s));
                            else next.delete(keyOf(s));
                            return next;
                          })
                        }
                      />
                      <span className="w-16 shrink-0 text-sm font-semibold text-fg">
                        {t.planning.kinds[s.kind]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base text-fg">{s.employee.fullName}</span>
                        <span className="block text-sm text-muted">
                          {t.planning.weeklyHours(s.weeklyHours)}
                          {!s.homeSite && ` · ${t.planning.otherSite}`}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {view && short > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-semibold text-accent">{t.planning.unfilled(short)}</p>
          <p className="text-sm text-muted">
            {view.unfilled
              .map(
                (u) =>
                  `${dayLabel(u.date)} · ${t.planning.kinds[u.kind]} (${t.planning.stillShort(u.missing)})`,
              )
              .join(' · ')}
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {view && view.suggestions.length > 0 && (
          <Button loading={applying} disabled={chosen.size === 0} onClick={apply}>
            {t.planning.apply(chosen.size)}
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          {t.common.cancel}
        </Button>
      </div>
    </Card>
  );
}
