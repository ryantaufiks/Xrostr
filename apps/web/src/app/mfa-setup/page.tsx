'use client';

import type { MfaSetupResponse } from '@xrostr/contracts';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AuthLayout } from '@/components/app-shell';
import { Alert, Button, Field, Input, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fetchPrincipal, homeFor } from '@/lib/session';

export default function MfaSetupPage() {
  const t = useT();
  const router = useRouter();
  const started = useRef(false);
  const [setup, setSetup] = useState<(MfaSetupResponse & { qr: string }) | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Each call issues a new secret, so start exactly once per visit.
    if (started.current) return;
    started.current = true;
    api<MfaSetupResponse>('/auth/mfa/setup', { method: 'POST' })
      .then(async (response) =>
        setSetup({
          ...response,
          qr: await QRCode.toDataURL(response.otpauthUrl, { margin: 1, width: 208 }),
        }),
      )
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) router.replace('/login');
        else if (e instanceof ApiError && e.code === 'mfa_already_enabled') router.replace('/');
        else setError(e instanceof ApiError ? e.message : t.common.error);
      });
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api('/auth/mfa/enable', { body: { code } });
      router.replace(homeFor(await fetchPrincipal()));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.common.error);
      setCode('');
      setLoading(false);
    }
  }

  return (
    <AuthLayout title={t.auth.mfaTitle} subtitle={t.auth.mfaSubtitle}>
      {!setup && !error && <Spinner label={t.auth.mfaPreparing} />}
      {setup && (
        <div className="space-y-5">
          <ol className="list-decimal space-y-1.5 pl-5 text-base text-muted">
            <li>{t.auth.mfaStep1}</li>
            <li>{t.auth.mfaStep2}</li>
            <li>{t.auth.mfaStep3}</li>
          </ol>
          <div className="flex flex-col items-center gap-3 rounded-xl border border-control p-4">
            <img src={setup.qr} alt={t.auth.mfaQrAlt} className="size-52 rounded-lg bg-white p-2" />
            <code className="rounded-md border border-control px-3 py-1.5 font-mono text-base break-all text-fg">
              {setup.secret.match(/.{1,4}/g)?.join(' ')}
            </code>
          </div>
        </div>
      )}
      <form onSubmit={submit} className="mt-5 space-y-4">
        {error && <Alert>{error}</Alert>}
        {setup && (
          <>
            <Field label={t.auth.totp} htmlFor="code">
              <Input
                id="code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoComplete="one-time-code"
                required
                className="font-mono text-2xl tracking-[0.4em]"
              />
            </Field>
            <Button type="submit" loading={loading} className="w-full">
              {t.auth.mfaSubmit}
            </Button>
          </>
        )}
      </form>
    </AuthLayout>
  );
}
