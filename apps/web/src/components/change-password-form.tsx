'use client';

import { passwordSchema } from '@xrostr/contracts';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert, Button, Field, Input } from './ui';
import { AccountSection } from './account-section';

type Errors = Partial<Record<'current' | 'next' | 'confirm', string>>;

export function ChangePasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  function validate(): Errors {
    const found: Errors = {};
    if (!current) found.current = 'Masukkan password saat ini.';
    if (!passwordSchema.safeParse(next).success) {
      found.next = 'Minimal 12 karakter, berisi huruf dan angka.';
    } else if (next === current) {
      found.next = 'Password baru harus berbeda dari password saat ini.';
    }
    if (confirm !== next) found.confirm = 'Konfirmasi password tidak sama.';
    return found;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSaved(false);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    try {
      await api('/auth/change-password', { body: { currentPassword: current, newPassword: next } });
      setCurrent('');
      setNext('');
      setConfirm('');
      setSaved(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'invalid_current_password') {
        setErrors({ current: e.message });
      } else {
        setFormError(e instanceof ApiError ? e.message : 'Terjadi kesalahan.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccountSection
      title="Ganti password"
      description="Setelah diganti, semua perangkat lain otomatis keluar. Sesi di perangkat ini tetap aktif."
    >
      <form onSubmit={submit} className="max-w-md space-y-4" noValidate>
        {formError && <Alert>{formError}</Alert>}
        {saved && <Alert tone="success">Password berhasil diganti.</Alert>}
        <Field label="Password saat ini" htmlFor="current" error={errors.current}>
          <Input
            id="current"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            aria-invalid={!!errors.current}
          />
        </Field>
        <Field
          label="Password baru"
          htmlFor="next"
          hint="Minimal 12 karakter, berisi huruf dan angka."
          error={errors.next}
        >
          <Input
            id="next"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            aria-invalid={!!errors.next}
          />
        </Field>
        <Field label="Ulangi password baru" htmlFor="confirm" error={errors.confirm}>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            aria-invalid={!!errors.confirm}
          />
        </Field>
        <Button type="submit" loading={loading}>
          Simpan password
        </Button>
      </form>
    </AccountSection>
  );
}
