'use client';

import type { CreateLocationRequest, LocationView } from '@xrostr/contracts';
import { Crosshair } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fieldErrors, TIMEZONE_LABELS, type LegalEntityOption } from '@/lib/workforce';
import { Alert, Button, Card, Field, Input, Select } from './ui';

type Values = Omit<
  CreateLocationRequest,
  'latitude' | 'longitude' | 'geofenceRadiusM' | 'welfareIntervalMinutes'
> & {
  latitude: string;
  longitude: string;
  geofenceRadiusM: string;
  welfareIntervalMinutes: string;
};

const fromLocation = (l: LocationView): Values => ({
  legalEntityId: l.legalEntity.id,
  name: l.name,
  code: l.code,
  address: l.address ?? '',
  timezone: l.timezone,
  latitude: l.latitude?.toString() ?? '',
  longitude: l.longitude?.toString() ?? '',
  geofenceRadiusM: String(l.geofenceRadiusM),
  welfareIntervalMinutes: l.welfareIntervalMinutes?.toString() ?? '',
});

/** Create or edit a site. Coordinates can come from the device while standing on site. */
export function LocationForm({
  entities,
  location,
  onSaved,
}: {
  entities: LegalEntityOption[];
  location?: LocationView;
  onSaved: (saved: LocationView) => void;
}) {
  const t = useT();
  const first = entities[0];
  const [values, setValues] = useState<Values>(
    location
      ? fromLocation(location)
      : {
          legalEntityId: first?.id ?? '',
          name: '',
          code: '',
          address: '',
          timezone: first?.defaultTimezone ?? '',
          latitude: '',
          longitude: '',
          geofenceRadiusM: '150',
          welfareIntervalMinutes: '',
        },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  const entity = entities.find((e) => e.id === values.legalEntityId);
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  function useMyLocation() {
    if (!navigator.geolocation) return setFormError(t.sites.noGeolocation);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set({
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        });
        setLocating(false);
      },
      () => {
        setFormError(t.sites.locationDenied);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setErrors({});
    const coords =
      values.latitude.trim() || values.longitude.trim()
        ? { latitude: Number(values.latitude), longitude: Number(values.longitude) }
        : { latitude: null, longitude: null };
    const body = {
      name: values.name,
      code: values.code,
      address: values.address,
      timezone: values.timezone,
      geofenceRadiusM: Number(values.geofenceRadiusM),
      welfareIntervalMinutes: values.welfareIntervalMinutes.trim()
        ? Number(values.welfareIntervalMinutes)
        : null,
      ...coords,
      ...(location ? {} : { legalEntityId: values.legalEntityId }),
    };
    setSaving(true);
    try {
      const saved = location
        ? await api<LocationView>(`/tenant/locations/${location.id}`, { method: 'PATCH', body })
        : await api<LocationView>('/tenant/locations', { body });
      onSaved(saved);
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(fieldErrors(e.fieldErrors));
        if (e.code === 'location_code_taken') setErrors({ code: e.message });
        if (e.code === 'timezone_not_in_country') setErrors({ timezone: e.message });
        setFormError(e.message);
      } else {
        setFormError(t.common.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {formError && <Alert>{formError}</Alert>}
      <Card className="space-y-5 p-5 sm:p-6">
        <Field label={t.sites.entity} htmlFor="entity" hint={t.sites.entityHint}>
          <Select
            id="entity"
            value={values.legalEntityId}
            disabled={!!location}
            onChange={(e) => {
              const next = entities.find((x) => x.id === e.target.value);
              set({ legalEntityId: e.target.value, timezone: next?.defaultTimezone ?? '' });
            }}
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({t.common.countries[e.countryCode] ?? e.countryCode})
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-5 sm:grid-cols-[1fr_200px]">
          <Field label={t.sites.name} htmlFor="name" error={errors.name}>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Menara Sudirman"
              aria-invalid={!!errors.name}
            />
          </Field>
          <Field
            label={t.sites.codeLabel}
            htmlFor="code"
            hint={t.sites.codeHint}
            error={errors.code}
          >
            <Input
              id="code"
              value={values.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
              className="font-mono"
              aria-invalid={!!errors.code}
            />
          </Field>
        </div>
        <Field label={t.sites.address} htmlFor="address" error={errors.address}>
          <Input
            id="address"
            value={values.address ?? ''}
            onChange={(e) => set({ address: e.target.value })}
          />
        </Field>
        <Field label={t.sites.timezone} htmlFor="timezone" error={errors.timezone}>
          <Select
            id="timezone"
            value={values.timezone}
            onChange={(e) => set({ timezone: e.target.value })}
          >
            {(entity?.timezones ?? []).map((tz) => (
              <option key={tz} value={tz}>
                {TIMEZONE_LABELS[tz] ?? tz}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <div>
          <h2 className="label font-bold text-fg">{t.sites.pointTitle}</h2>
          <p className="mt-1 text-sm text-muted">{t.sites.pointHint}</p>
        </div>
        <Button type="button" variant="secondary" loading={locating} onClick={useMyLocation}>
          <Crosshair className="size-5" aria-hidden />
          {t.sites.useMyLocation}
        </Button>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label={t.sites.latitude} htmlFor="lat" error={errors.latitude}>
            <Input
              id="lat"
              inputMode="decimal"
              value={values.latitude}
              onChange={(e) => set({ latitude: e.target.value })}
              placeholder="-6.208800"
            />
          </Field>
          <Field label={t.sites.longitude} htmlFor="lng" error={errors.longitude}>
            <Input
              id="lng"
              inputMode="decimal"
              value={values.longitude}
              onChange={(e) => set({ longitude: e.target.value })}
              placeholder="106.845600"
            />
          </Field>
          <Field
            label={t.sites.radiusLabel}
            htmlFor="radius"
            hint="30–2000 m"
            error={errors.geofenceRadiusM}
          >
            <Input
              id="radius"
              type="number"
              min={30}
              max={2000}
              step={10}
              value={values.geofenceRadiusM}
              onChange={(e) => set({ geofenceRadiusM: e.target.value })}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <Field
          label={t.safety.welfareInterval}
          htmlFor="welfare"
          hint={t.safety.welfareIntervalHint}
          error={errors.welfareIntervalMinutes}
        >
          <Input
            id="welfare"
            type="number"
            min={15}
            max={480}
            step={5}
            inputMode="numeric"
            className="max-w-48"
            value={values.welfareIntervalMinutes}
            onChange={(e) => set({ welfareIntervalMinutes: e.target.value })}
          />
        </Field>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          {location ? t.sites.saveChanges : t.sites.add}
        </Button>
      </div>
    </form>
  );
}
