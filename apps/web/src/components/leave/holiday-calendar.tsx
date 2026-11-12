'use client';

import type { CountryCode, HolidayView } from '@xrostr/contracts';
import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Field, Input, Select, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { dayLabel } from '@/lib/dates';
import { COUNTRY_LABELS } from '@/lib/format';
import { useData } from '@/lib/use-data';

/**
 * Public holidays of one country and year. The starting list comes from the Country Pack;
 * HR checks it against the official decree and adjusts it here.
 */
export function HolidayCalendar({
  countries,
  year,
  canManage,
}: {
  countries: CountryCode[];
  year: number;
  canManage: boolean;
}) {
  const [country, setCountry] = useState<CountryCode>(countries[0]!);
  const list = useData<HolidayView[]>(`/tenant/holidays?countryCode=${country}&year=${year}`);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ date: '', name: '' });
  const [saving, setSaving] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api('/tenant/holidays', { body: { countryCode: country, ...form } });
      setForm({ date: '', name: '' });
      await list.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(holiday: HolidayView) {
    if (!confirm(`Hapus ${holiday.name} dari daftar hari libur?`)) return;
    try {
      await api(`/tenant/holidays/${holiday.id}`, { method: 'DELETE' });
      await list.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan.');
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="holidays">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="holidays" className="font-display text-2xl font-bold">
          Hari libur nasional {year}
        </h2>
        {countries.length > 1 && (
          <div className="w-48">
            <Field label="Negara" htmlFor="holiday-country">
              <Select
                id="holiday-country"
                value={country}
                onChange={(e) => setCountry(e.target.value as CountryCode)}
              >
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {COUNTRY_LABELS[c] ?? c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </div>
      {canManage && (
        <Alert tone="success">
          Daftar awal disiapkan sistem dan perlu diverifikasi dengan keputusan resmi pemerintah
          (SKB/gazette), terutama tanggal hari raya berbasis kalender bulan. Tambah atau hapus di
          sini bila berbeda.
        </Alert>
      )}
      {error && <Alert>{error}</Alert>}
      {list.error && <Alert>{list.error}</Alert>}
      {!list.data && !list.error && <Spinner />}
      {list.data && (
        <Card>
          {list.data.length === 0 ? (
            <p className="px-5 py-4 text-base text-muted">Belum ada hari libur untuk tahun ini.</p>
          ) : (
            <ul className="divide-y divide-line">
              {list.data.map((h) => (
                <li key={h.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-lg text-fg">{h.name}</p>
                    <p className="text-base text-muted">{dayLabel(h.date)}</p>
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      aria-label={`Hapus ${h.name}`}
                      onClick={() => remove(h)}
                    >
                      <Trash2 className="size-5" aria-hidden />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {canManage && (
        <Card className="p-5">
          <form onSubmit={add} className="grid gap-4 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
            <Field label="Tanggal" htmlFor="holiday-date">
              <Input
                id="holiday-date"
                type="date"
                required
                min={`${year}-01-01`}
                max={`${year}-12-31`}
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>
            <Field label="Nama hari libur" htmlFor="holiday-name">
              <Input
                id="holiday-name"
                required
                minLength={2}
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Button type="submit" loading={saving}>
              Tambah
            </Button>
          </form>
        </Card>
      )}
    </section>
  );
}
