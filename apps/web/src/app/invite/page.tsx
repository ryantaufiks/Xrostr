'use client';

import { passwordSchema } from '@xrostr/contracts';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { AuthLayout } from '@/components/app-shell';
import { Alert, Button, Field, Input, buttonStyles } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';

export default function InvitePage() {
  return (
    <Suspense>
      <InviteForm />
    </Suspense>
  );
}

function InviteForm() {
  const t = useT();
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
    if (!checked.success) return setError(t.invite.passwordRule);
    if (password !== confirm) return setError(t.invite.mismatch);

    setLoading(true);
    try {
      await api('/auth/accept-invite', { body: { inviteToken: token, password } });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.common.error);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title={t.invite.notFound}>
        <Alert>{t.invite.incomplete}</Alert>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title={t.invite.activeTitle}>
        <div className="space-y-4">
          <Alert tone="success">{t.invite.activeHint}</Alert>
          <Link
            href={`/login${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''}`}
            className={buttonStyles('primary', 'w-full')}
          >
            {t.invite.signInNow}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t.invite.title}
      subtitle={tenant ? t.invite.subtitleAt(tenant) : t.invite.subtitle}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label={t.invite.newPassword} htmlFor="password" hint={t.invite.passwordHint}>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label={t.invite.repeat} htmlFor="confirm">
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
          {t.invite.activate}
        </Button>
      </form>
    </AuthLayout>
  );
}
