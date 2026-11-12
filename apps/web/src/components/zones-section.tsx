'use client';

import type { LocationView, ZoneView } from '@xrostr/contracts';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Button, Card, Field, Input, cx } from './ui';

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
            <li key={z.id} className="py-2">
              <p className="font-semibold text-fg">{z.name}</p>
              <p className="text-sm text-muted">{z.locations.map((l) => l.name).join(' · ')}</p>
            </li>
          ))}
        </ul>
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
