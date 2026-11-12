'use client';

import { Building2, ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { AuthLayout } from '@/components/app-shell';
import {
  Alert,
  Button,
  Field,
  Input,
  SegmentedControl,
  segmentedOptionStyles,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { destinationAfterLogin, fetchPrincipal } from '@/lib/session';

type Mode = 'tenant' | 'platform';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const t = useT();
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
      router.replace(destinationAfterLogin(await fetchPrincipal(), params.get('next')));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'mfa_required') {
        setNeedsCode(true);
      } else {
        setError(e instanceof ApiError ? e.message : t.common.error);
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
    <AuthLayout title={t.auth.loginTitle} subtitle={t.auth.loginSubtitle}>
      <SegmentedControl className="mb-6 grid grid-cols-2" role="tablist">
        {(
          [
            ['tenant', t.auth.company, Building2],
            ['platform', t.auth.superadmin, ShieldCheck],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => switchMode(value)}
            className={segmentedOptionStyles(mode === value)}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </button>
        ))}
      </SegmentedControl>

      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {mode === 'tenant' && (
          <Field label={t.auth.companyCode} htmlFor="tenant" hint={t.auth.companyCodeHint}>
            <Input
              id="tenant"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value.toLowerCase())}
              autoComplete="organization"
              required
            />
          </Field>
        )}
        <Field label={t.auth.email} htmlFor="email">
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </Field>
        <Field label={t.auth.password} htmlFor="password">
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
          <Field label={t.auth.totp} htmlFor="totp" hint={t.auth.totpHint}>
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
          {t.auth.signIn}
        </Button>
      </form>
    </AuthLayout>
  );
}
