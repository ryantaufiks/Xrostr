'use client';

import type { StaffingRequirement, StaffingView } from '@xrostr/contracts';
import { Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useToast } from '@/components/toast';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Button, Card, Input } from './ui';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * How many officers a site needs each day of the week, day and night. One row per weekday;
 * "Same every day" copies Monday to the rest, the usual starting point.
 */
export function StaffingEditor({
  siteId,
  staffing,
  onSaved,
}: {
  siteId: string;
  staffing: StaffingView | null;
  onSaved: () => Promise<void>;
}) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<StaffingRequirement[]>(() => initial(staffing));
  const [saving, setSaving] = useState(false);

  const set = (weekday: number, patch: Partial<StaffingRequirement>) =>
    setRows((current) => current.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)));
  const sameEveryDay = () =>
    setRows((current) =>
      current.map((r) => ({
        ...r,
        dayCount: current[0]!.dayCount,
        nightCount: current[0]!.nightCount,
      })),
    );

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api(`/tenant/locations/${siteId}/staffing`, {
        method: 'PUT',
        body: { requirements: rows },
      });
      toast.push('success', t.schedule.staffingSaved);
      setOpen(false);
      await onSaved();
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : t.common.error);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant="secondary"
        onClick={() => {
          setRows(initial(staffing));
          setOpen(true);
        }}
      >
        <Users className="size-5" aria-hidden />
        {t.schedule.staffingEdit}
      </Button>
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <form onSubmit={save} className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold">{t.schedule.staffingTitle}</h2>
          <p className="mt-1 text-sm text-muted">{t.schedule.staffingHint}</p>
        </div>
        <table className="w-full max-w-md text-left text-base">
          <thead className="label text-muted">
            <tr>
              <th className="py-2 font-bold">{t.schedule.weekday}</th>
              <th className="py-2 font-bold">{t.schedule.presetDay}</th>
              <th className="py-2 font-bold">{t.schedule.presetNight}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.weekday}>
                <th scope="row" className="py-1.5 pr-3 font-semibold text-fg">
                  {t.schedule.weekdays[r.weekday - 1]}
                </th>
                {(['dayCount', 'nightCount'] as const).map((field) => (
                  <td key={field} className="py-1.5 pr-3">
                    <Input
                      type="number"
                      min={0}
                      max={99}
                      inputMode="numeric"
                      aria-label={`${t.schedule.weekdays[r.weekday - 1]} · ${
                        field === 'dayCount' ? t.schedule.presetDay : t.schedule.presetNight
                      }`}
                      className="h-11 w-20"
                      value={r[field]}
                      onChange={(e) =>
                        set(r.weekday, { [field]: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={saving}>
            {t.common.save}
          </Button>
          <Button type="button" variant="secondary" onClick={sameEveryDay}>
            {t.schedule.staffingSameEveryDay}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t.common.cancel}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** The saved week, or zero for every day when the site has no targets yet. */
function initial(staffing: StaffingView | null): StaffingRequirement[] {
  return WEEKDAYS.map(
    (weekday) =>
      staffing?.requirements.find((r) => r.weekday === weekday) ?? {
        weekday,
        dayCount: 0,
        nightCount: 0,
      },
  );
}
