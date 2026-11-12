'use client';

import { passwordSchema } from '@xrostr/contracts';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Alert, Button, Field, Input } from './ui';
import { AccountSection } from './account-section';

type Errors = Partial<Record<'current' | 'next' | 'confirm', string>>;

export function ChangePasswordCard() {
  const t = useT();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  function validate(): Errors {
    const found: Errors = {};
    if (!current) found.current = t.account.currentRequired;
    if (!passwordSchema.safeParse(next).success) {
      found.next = t.account.passwordRule;
    } else if (next === current) {
      found.next = t.account.passwordSame;
    }
    if (confirm !== next) found.confirm = t.account.confirmMismatch;
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
        setFormError(e instanceof ApiError ? e.message : t.common.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccountSection title={t.account.passwordTitle} description={t.account.passwordDescription}>
      <form onSubmit={submit} className="max-w-md space-y-4" noValidate>
        {formError && <Alert>{formError}</Alert>}
        {saved && <Alert tone="success">{t.account.passwordChanged}</Alert>}
        <Field label={t.account.currentPassword} htmlFor="current" error={errors.current}>
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
          label={t.account.newPassword}
          htmlFor="next"
          hint={t.account.passwordRule}
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
        <Field label={t.account.repeatPassword} htmlFor="confirm" error={errors.confirm}>
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
          {t.account.savePassword}
        </Button>
      </form>
    </AccountSection>
  );
}
