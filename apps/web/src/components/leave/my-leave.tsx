'use client';

import {
  requestLeaveSchema,
  type LeaveBalance,
  type LeaveRequestView,
  type MyLeave,
} from '@xrostr/contracts';
import { CalendarPlus } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Field, Input, Select, Spinner, cx } from '@/components/ui';
import { useConfirm } from '@/components/confirm-dialog';
import { api, ApiError } from '@/lib/api';
import { todayLocal } from '@/lib/dates';
import { LeaveRequestRow } from './leave-request-row';
import { useI18n } from '@/lib/i18n';

/** The signed-in employee's balances, request form and own requests. */
export function MyLeaveSection({
  onCountry,
}: {
  onCountry?: (country: MyLeave['countryCode']) => void;
}) {
  const { t, locale } = useI18n();
  const { confirm, confirmDialog } = useConfirm();
  const [leave, setLeave] = useState<MyLeave | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notEmployee, setNotEmployee] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<MyLeave>('/me/leave');
      setLeave(data);
      onCountry?.(data.countryCode);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_an_employee') setNotEmployee(true);
      else setError(e instanceof ApiError ? e.message : t.common.error);
    }
  }, [onCountry]);
  useEffect(() => void load(), [load]);

  async function cancel(request: LeaveRequestView) {
    if (
      !(await confirm({
        message: t.leave.cancelConfirm(request.leaveType.name[locale]),
        confirmLabel: t.leave.cancelRequest,
      }))
    )
      return;
    setNotice(null);
    try {
      await api(`/me/leave/${request.id}/cancel`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.common.error);
    }
  }

  if (notEmployee) return null;
  if (error) return <Alert>{error}</Alert>;
  if (!leave) return <Spinner />;

  return (
    <section className="space-y-6" aria-labelledby="my-leave">
      {confirmDialog}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="my-leave" className="font-display text-2xl font-bold">
          {t.leave.balanceTitle(leave.year)}
        </h2>
        {!formOpen && (
          <Button onClick={() => (setFormOpen(true), setNotice(null))}>
            <CalendarPlus className="size-5" aria-hidden />
            {t.leave.request}
          </Button>
        )}
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}
      {formOpen && (
        <RequestForm
          balances={leave.balances}
          onClose={() => setFormOpen(false)}
          onSent={async (r) => {
            setFormOpen(false);
            setNotice(t.leave.sent(r.leaveType.name[locale], r.days));
            await load();
          }}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {leave.balances
          .filter((b) => b.code !== 'unpaid')
          .map((b) => (
            <BalanceCard key={b.code} balance={b} />
          ))}
      </div>

      <h2 className="font-display text-2xl font-bold">{t.leave.myRequests}</h2>
      {leave.requests.length === 0 ? (
        <p className="text-base text-muted">{t.leave.noRequests}</p>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {leave.requests.map((r) => (
              <LeaveRequestRow key={r.id} request={r}>
                {r.status === 'pending' && (
                  <Button variant="secondary" onClick={() => cancel(r)}>
                    {t.leave.cancelRequest}
                  </Button>
                )}
              </LeaveRequestRow>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function BalanceCard({ balance: b }: { balance: LeaveBalance }) {
  const { t, locale } = useI18n();
  return (
    <Card className={cx('p-5', !b.eligible && 'opacity-60')}>
      <p className="text-lg font-semibold text-fg">{b.name[locale]}</p>
      {b.remaining === null ? (
        <p className="mt-2 text-base text-muted">
          {b.requiresDocument ? t.leave.withDocument : t.leave.noFixedQuota}
          {b.used > 0 && ` · ${t.leave.usedDays(b.used)}`}
        </p>
      ) : (
        <p className="mt-2 text-base text-muted">
          <span className="text-4xl font-bold text-fg tabular-nums">{b.remaining}</span> /{' '}
          {b.entitlement} hari
          <span className="block text-sm">
            {t.leave.used(b.used)}
            {b.pending > 0 && ` · ${t.leave.pendingDays(b.pending)}`}
          </span>
        </p>
      )}
      {!b.eligible && <p className="mt-2 text-sm text-accent">{t.leave.notEligible}</p>}
      <p className="mt-2 text-sm text-faint">{b.basis}</p>
    </Card>
  );
}

function RequestForm({
  balances,
  onClose,
  onSent,
}: {
  balances: LeaveBalance[];
  onClose: () => void;
  onSent: (request: LeaveRequestView) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const usable = balances.filter((b) => b.eligible);
  const today = todayLocal();
  const [form, setForm] = useState({
    leaveType: usable[0]?.code ?? '',
    startDate: today,
    endDate: today,
    reason: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const chosen = usable.find((b) => b.code === form.leaveType);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = requestLeaveSchema.safeParse({ ...form, reason: form.reason || undefined });
    if (!parsed.success) {
      setError(t.leave.endBeforeStart);
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onSent(await api<LeaveRequestView>('/me/leave', { body: parsed.data }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.common.error);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <form onSubmit={submit} className="space-y-5">
        <h3 className="font-display text-xl font-bold">{t.leave.request}</h3>
        {error && <Alert>{error}</Alert>}
        <Field
          label={t.leave.type}
          htmlFor="leave-type"
          hint={chosen?.requiresDocument ? t.leave.documentHint : undefined}
        >
          <Select
            id="leave-type"
            value={form.leaveType}
            onChange={(e) => setForm({ ...form, leaveType: e.target.value })}
          >
            {usable.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name[locale]}
                {b.remaining !== null ? t.leave.remaining(b.remaining) : ''}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t.leave.from} htmlFor="leave-start">
            <Input
              id="leave-start"
              type="date"
              required
              value={form.startDate}
              onChange={(e) =>
                setForm({
                  ...form,
                  startDate: e.target.value,
                  endDate: form.endDate < e.target.value ? e.target.value : form.endDate,
                })
              }
            />
          </Field>
          <Field label={t.leave.to} htmlFor="leave-end" hint={t.leave.holidaysExcluded}>
            <Input
              id="leave-end"
              type="date"
              required
              min={form.startDate}
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </Field>
        </div>
        <Field label={t.leave.reason} htmlFor="leave-reason">
          <Input
            id="leave-reason"
            maxLength={500}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={sending} disabled={!chosen}>
            {t.leave.send}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
        </div>
      </form>
    </Card>
  );
}
