'use client';

import {
  expandRotation,
  parseRotation,
  type EmployeeView,
  type LocationView,
  type RotationResult,
  type RotationStep,
} from '@xrostr/contracts';
import { useState } from 'react';
import { useToast } from '@/components/toast';
import { api, ApiError } from '@/lib/api';
import { addDays, dayLabel } from '@/lib/dates';
import { useT } from '@/lib/i18n';
import { Alert, Button, Card, Field, Input, Select, cx } from './ui';

/** Common security rotations, written as steps. */
const PRESETS: RotationStep[][] = [
  ['day', 'day', 'night', 'night', 'off', 'off'],
  ['day', 'day', 'day', 'day', 'off', 'off'],
  ['night', 'night', 'night', 'off', 'off'],
  ['day', 'night', 'off'],
  ['day', 'day', 'day', 'day', 'day', 'off', 'off'],
];
const CUSTOM = 'custom';
const PREVIEW_DAYS = 14;

/**
 * Applies a repeating pattern to one officer at this site as drafts, from a start date to an end
 * date (four weeks by default). The server skips leave days and published shifts.
 */
export function RotationPanel({
  site,
  officers,
  monday,
  onApplied,
  onClose,
}: {
  site: LocationView;
  officers: EmployeeView[];
  monday: string;
  onApplied: () => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const letters = (steps: readonly RotationStep[]) =>
    steps.map((s) => t.planning.stepLetters[s]).join(' ');
  const [employeeId, setEmployeeId] = useState(officers[0]?.id ?? '');
  const [preset, setPreset] = useState('0');
  const [text, setText] = useState(letters(PRESETS[0]!));
  const [startAt, setStartAt] = useState(0);
  const [from, setFrom] = useState(monday);
  const [to, setTo] = useState(addDays(monday, 27));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pattern = preset === CUSTOM ? parseRotation(text) : PRESETS[Number(preset)]!;
  const invalid =
    !pattern || pattern.length === 0
      ? t.planning.invalidPattern
      : pattern.every((s) => s === 'off')
        ? t.planning.needsWork
        : null;
  const step = pattern && startAt < pattern.length ? startAt : 0;
  const preview =
    pattern && !invalid ? expandRotation(pattern, from, addDays(from, PREVIEW_DAYS - 1), step) : [];

  async function apply() {
    if (!pattern || invalid) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<RotationResult>('/tenant/roster/rotation', {
        body: { locationId: site.id, employeeId, from, to, pattern, startAt: step },
      });
      toast.push('success', t.planning.rotationDone(result.created, result.skipped.length));
      await onApplied();
      onClose();
    } catch (e) {
      if (!(e instanceof ApiError)) setError(t.common.error);
      else {
        const date = typeof e.details.date === 'string' ? e.details.date : null;
        setError(date ? `${dayLabel(date)}: ${e.message}` : e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <p className="label font-bold text-fg">{t.planning.rotationTitle}</p>
        <p className="mt-1 text-sm text-muted">{t.planning.rotationHint}</p>
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.planning.officer} htmlFor="rotation-officer">
          <Select
            id="rotation-officer"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            {officers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.fullName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.planning.pattern} htmlFor="rotation-pattern">
          <Select
            id="rotation-pattern"
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              setStartAt(0);
              if (e.target.value !== CUSTOM) setText(letters(PRESETS[Number(e.target.value)]!));
            }}
          >
            {PRESETS.map((p, i) => (
              <option key={i} value={String(i)}>
                {letters(p)}
              </option>
            ))}
            <option value={CUSTOM}>{t.planning.custom}</option>
          </Select>
        </Field>
        {preset === CUSTOM && (
          <Field label={t.planning.patternLetters} htmlFor="rotation-letters">
            <Input
              id="rotation-letters"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoCapitalize="characters"
            />
          </Field>
        )}
        {pattern && pattern.length > 1 && (
          <Field label={t.planning.startAt} htmlFor="rotation-step">
            <Select
              id="rotation-step"
              value={step}
              onChange={(e) => setStartAt(Number(e.target.value))}
            >
              {pattern.map((s, i) => (
                <option key={i} value={i}>
                  {t.planning.step(i + 1, t.planning.stepLetters[s]!)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t.planning.from} htmlFor="rotation-from">
          <Input
            id="rotation-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label={t.planning.to} htmlFor="rotation-to">
          <Input id="rotation-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {invalid && <p className="text-sm text-accent">{invalid}</p>}
      {preview.length > 0 && (
        <div>
          <p className="label mb-2 font-bold text-muted">{t.planning.preview}</p>
          <div className="grid grid-cols-7 gap-1">
            {preview.map(({ date, step: s }) => (
              <div
                key={date}
                title={dayLabel(date)}
                className={cx(
                  'rounded-lg border px-1 py-1.5 text-center',
                  s === 'off' ? 'border-line text-faint' : 'border-control text-fg',
                )}
              >
                <span className="block text-xs text-muted tabular-nums">{date.slice(8, 10)}</span>
                <span className="block text-base font-bold">{t.planning.stepLetters[s]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          loading={busy}
          disabled={!employeeId || !!invalid || !from || !to || from > to}
          onClick={apply}
        >
          {t.planning.applyRotation}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t.common.cancel}
        </Button>
      </div>
    </Card>
  );
}
