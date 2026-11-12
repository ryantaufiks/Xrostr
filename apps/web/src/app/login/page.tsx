'use client';

import { Building2, ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { AuthLayout } from '@/components/app-shell';
import { Alert, Button, Field, Input, cx } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fetchPrincipal, homeFor } from '@/lib/session';

type Mode = 'tenant' | 'platform';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'platform' ? 'platform' : 'tenant');
  const [tenantSlug, setTenantSlug] = useState(params.get('tenant') ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const credentials = { email, password, ...(needsCode && { totpCode }) };
      await api(mode === 'platform' ? '/platform/auth/login' : '/auth/login', {
        body: mode === 'platform' ? credentials : { ...credentials, tenantSlug },
      });
      router.replace(homeFor(await fetchPrincipal()));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'mfa_required') {
        setNeedsCode(true);
      } else {
        setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan.');
        if (e instanceof ApiError && e.code === 'invalid_mfa_code') setTotpCode('');
      }
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setNeedsCode(false);
    setError(null);
  }

  return (
    <AuthLayout
      title="Masuk ke Xrostr"
      subtitle="Gunakan akun perusahaan Anda atau akun Superadmin platform."
    >
      <div
        className="mb-6 grid grid-cols-2 gap-1 rounded-full border border-control p-1"
        role="tablist"
      >
        {(
          [
            ['tenant', 'Perusahaan', Building2],
            ['platform', 'Superadmin', ShieldCheck],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => switchMode(value)}
            className={cx(
              'label inline-flex min-h-11 items-center justify-center gap-2 rounded-full font-bold transition',
              mode === value ? 'bg-fg text-bg' : 'text-muted hover:text-fg',
            )}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {mode === 'tenant' && (
          <Field
            label="Kode perusahaan"
            htmlFor="tenant"
            hint="Slug perusahaan, misalnya garda-aman."
          >
            <Input
              id="tenant"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value.toLowerCase())}
              autoComplete="organization"
              required
            />
          </Field>
        )}
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        {needsCode && (
          <Field
            label="Kode authenticator"
            htmlFor="totp"
            hint="6 digit dari Google Authenticator, Authy, atau sejenisnya."
          >
            <Input
              id="totp"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              autoComplete="one-time-code"
              autoFocus
              required
              className="font-mono text-2xl tracking-[0.4em]"
            />
          </Field>
        )}
        <Button type="submit" loading={loading} className="w-full">
          Masuk
        </Button>
      </form>
    </AuthLayout>
  );
}
