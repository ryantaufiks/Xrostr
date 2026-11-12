'use client';

import { VISIT_GAP_CHOICES, type LocationView, type ZoneView } from '@xrostr/contracts';
import { Footprints } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useToast } from '@/components/toast';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Button, Card, Field, Input, Select, buttonStyles, cx } from './ui';

const VISIT_CHOICES = [0, 1, 2, 3, 4, 5, 6] as const;

/** Lists roving zones and lets a planner create one by naming it and picking its sites. */
export function ZonesSection({
  zones,
  sites,
  onChanged,
}: {
  zones: ZoneView[];
  sites: LocationView[];
  onChanged: () => Promise<void>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function create() {
    setSaving(true);
    setError(null);
    try {
      await api('/tenant/zones', { body: { name: name.trim(), locationIds: [...selected] } });
      setName('');
      setSelected(new Set());
      await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.common.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <button
        type="button"
        className="flex w-full items-center justify-between"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="label font-bold text-fg">{t.schedule.manageZones}</span>
        <span className="text-muted">{open ? '−' : '+'}</span>
      </button>

      {zones.length === 0 && !open && <p className="text-sm text-muted">{t.schedule.noZones}</p>}

      {zones.length > 0 && (
        <ul className="divide-y divide-line">
          {zones.map((z) => (
            <ZoneRow key={z.id} zone={z} onChanged={onChanged} />
          ))}
        </ul>
      )}
      {zones.length > 0 && (
        <Link href="/tenant/roving" className={buttonStyles('ghost', 'min-h-11 px-0')}>
          <Footprints className="size-5" aria-hidden />
          {t.visits.viewVisits}
        </Link>
      )}

      {open && (
        <div className="space-y-4 border-t border-line pt-4">
          {error && <p className="text-sm text-accent">{error}</p>}
          <Field label={t.schedule.zoneName} htmlFor="zone-name">
            <Input id="zone-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div>
            <p className="label mb-2 font-bold text-muted">{t.schedule.zoneSites}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {sites.map((s) => (
                <label
                  key={s.id}
                  className={cx(
                    'flex items-center gap-2 rounded-lg border border-control px-3 py-2 text-base',
                    selected.has(s.id) && 'border-fg',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="size-5"
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </div>
          <Button loading={saving} disabled={!name.trim() || selected.size === 0} onClick={create}>
            {t.schedule.newZone}
          </Button>
        </div>
      )}
    </Card>
  );
}

/** One zone: its sites with their visit targets, editable in place. */
function ZoneRow({ zone, onChanged }: { zone: ZoneView; onChanged: () => Promise<void> }) {
  const t = useT();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [gap, setGap] = useState(zone.visitGapMinutes);
  const [targets, setTargets] = useState<Record<string, number>>(() =>
    Object.fromEntries(zone.locations.map((l) => [l.id, l.minVisits])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gapChoices: readonly number[] = VISIT_GAP_CHOICES.includes(
    zone.visitGapMinutes as (typeof VISIT_GAP_CHOICES)[number],
  )
    ? VISIT_GAP_CHOICES
    : [...VISIT_GAP_CHOICES, zone.visitGapMinutes].sort((a, b) => a - b);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api(`/tenant/zones/${zone.id}/targets`, {
        method: 'PUT',
        body: {
          visitGapMinutes: gap,
          targets: zone.locations.map((l) => ({ locationId: l.id, minVisits: targets[l.id] ?? 0 })),
        },
      });
      toast.push('success', t.visits.saved);
      setEditing(false);
      await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.common.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-fg">{zone.name}</p>
          <p className="text-sm text-muted">
            {zone.locations
              .map((l) => (l.minVisits > 0 ? `${l.name} (${l.minVisits}×)` : l.name))
              .join(' · ')}
          </p>
        </div>
        {!editing && (
          <Button
            variant="ghost"
            className="min-h-11 shrink-0 px-0"
            onClick={() => setEditing(true)}
          >
            {t.visits.editTargets}
          </Button>
        )}
      </div>
      {editing && (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <p className="label font-bold text-fg">{t.visits.targetsTitle}</p>
          <p className="text-sm text-muted">{t.visits.targetsHint}</p>
          {error && <p className="text-sm text-accent">{error}</p>}
          {zone.locations.map((l) => (
            <Field key={l.id} label={l.name} htmlFor={`target-${zone.id}-${l.id}`}>
              <Select
                id={`target-${zone.id}-${l.id}`}
                value={targets[l.id] ?? 0}
                onChange={(e) => setTargets((v) => ({ ...v, [l.id]: Number(e.target.value) }))}
              >
                {VISIT_CHOICES.map((n) => (
                  <option key={n} value={n}>
                    {t.visits.perShift(n)}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
          <Field label={t.visits.gapLabel} htmlFor={`gap-${zone.id}`}>
            <Select
              id={`gap-${zone.id}`}
              value={gap}
              onChange={(e) => setGap(Number(e.target.value))}
            >
              {gapChoices.map((m) => (
                <option key={m} value={m}>
                  {t.visits.minutes(m)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button loading={saving} onClick={save}>
              {t.visits.saveTargets}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              {t.common.cancel}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
