'use client';

import { passwordSchema } from '@xrostr/contracts';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { AuthLayout } from '@/components/app-shell';
import { Alert, Button, Field, Input, buttonStyles } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function InvitePage() {
  return (
    <Suspense>
      <InviteForm />
    </Suspense>
  );
}

function InviteForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const tenant = params.get('tenant') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const checked = passwordSchema.safeParse(password);
    if (!checked.success)
      return setError('Password minimal 12 karakter dan berisi huruf serta angka.');
    if (password !== confirm) return setError('Konfirmasi password tidak sama.');

    setLoading(true);
    try {
      await api('/auth/accept-invite', { body: { inviteToken: token, password } });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Undangan tidak ditemukan">
        <Alert>Tautan undangan tidak lengkap. Minta tautan baru ke administrator Anda.</Alert>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Akun Anda aktif">
        <div className="space-y-4">
          <Alert tone="success">
            Password tersimpan. Saat masuk pertama kali, Anda akan diminta mengaktifkan autentikasi
            dua faktor.
          </Alert>
          <Link
            href={`/login${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''}`}
            className={buttonStyles('primary', 'w-full')}
          >
            Masuk sekarang
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Terima undangan"
      subtitle={
        tenant ? `Buat password untuk akun Anda di ${tenant}.` : 'Buat password untuk akun Anda.'
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field
          label="Password baru"
          htmlFor="password"
          hint="Minimal 12 karakter, berisi huruf dan angka."
        >
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label="Ulangi password" htmlFor="confirm">
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <Button type="submit" loading={loading} className="w-full">
          Aktifkan akun
        </Button>
      </form>
    </AuthLayout>
  );
}
