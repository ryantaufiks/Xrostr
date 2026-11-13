'use client';

import {
  PTKP_STATUSES,
  SG_RESIDENCY,
  SG_SHG_FUNDS,
  type AllowanceKind,
  type PayBasis,
  type PayCycle,
  type PayProfileRequest,
  type PayProfileView,
  type TaxMethod,
} from '@xrostr/contracts';
import { Eye, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/toast';
import { api, ApiError } from '@/lib/api';
import { todayLocal } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { formatMoney, fromMajorInput, toMajorInput } from '@/lib/money';
import { useData } from '@/lib/use-data';
import { Alert, Button, Card, Field, IconButton, Input, Select } from './ui';

/**
 * An employee's pay terms (versioned) and bank account. Identifiers come masked; a payroll
 * manager can show them in full, which the server records in the audit log.
 */
export function PayProfileCard({
  employeeId,
  canManage,
}: {
  employeeId: string;
  canManage: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const [reveal, setReveal] = useState(false);
  const data = useData<PayProfileView>(
    `/tenant/employees/${employeeId}/pay-profile${reveal ? '?reveal=true' : ''}`,
  );
  const [editing, setEditing] = useState(false);
  const [editingBank, setEditingBank] = useState(false);

  if (data.error) return <Alert>{data.error}</Alert>;
  const view = data.data;
  if (!view) return null;
  const money = (n: number) => formatMoney(n, view.currency, view.currencyMinorUnits);
  const suffix = (b: PayBasis) =>
    b === 'monthly' ? t.payroll.perMonth : b === 'daily' ? t.payroll.perDay : t.payroll.perHour;
  const cur = view.current;
  const isId = view.countryCode === 'ID';

  const rows: [string, string][] = cur
    ? [
        [t.payroll.baseAmount, `${money(cur.baseAmount)}${suffix(cur.payBasis)}`],
        [t.payroll.payCycle, t.payroll.payCycles[cur.payCycle]!],
        [t.payroll.workDays, t.payroll.workDaysValue(cur.workDaysPerWeek)],
        [t.payroll.overtimeEligible, cur.overtimeEligible ? '✓' : '—'],
        [
          t.payroll.taxMethod,
          cur.taxMethod ? t.payroll.taxMethods[cur.taxMethod]! : t.payroll.taxFollowsPolicy,
        ],
        ...cur.allowances.map((a): [string, string] => [
          a.label,
          `${money(a.amount)} · ${t.payroll.allowanceKinds[a.kind]}`,
        ]),
        ...((isId
          ? [
              [t.payroll.ptkp, cur.ptkpStatus ?? '—'],
              [t.payroll.taxId, cur.taxId ?? '—'],
              [t.payroll.bpjsTk, cur.bpjsTkNo ?? '—'],
              [t.payroll.bpjsKes, cur.bpjsKesNo ?? '—'],
            ]
          : [
              [
                t.payroll.sgResidency,
                cur.sgResidency ? t.payroll.residencies[cur.sgResidency]! : '—',
              ],
              [t.payroll.shg, cur.sgShgFund?.toUpperCase() ?? '—'],
              [t.payroll.pwmGrade, cur.pwmGrade ?? '—'],
              [t.payroll.dateOfBirth, cur.dateOfBirth ?? '—'],
            ]) as [string, string][]),
      ]
    : [];

  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="label font-bold text-fg">{t.payroll.profileTitle}</h2>
        <div className="flex gap-2">
          {canManage && !view.revealed && (cur || view.bankAccount) && (
            <Button variant="ghost" onClick={() => setReveal(true)}>
              <Eye className="size-5" aria-hidden />
              {t.payroll.reveal}
            </Button>
          )}
          {canManage && !editing && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {cur ? t.payroll.newVersion : t.payroll.setProfile}
            </Button>
          )}
        </div>
      </div>
      {view.revealed && <Alert tone="success">{t.payroll.revealedNote}</Alert>}

      {editing ? (
        <ProfileForm
          view={view}
          onCancel={() => setEditing(false)}
          onSaved={async () => {
            toast.push('success', t.payroll.profileSaved);
            setEditing(false);
            await data.reload();
          }}
        />
      ) : cur ? (
        <dl className="grid gap-x-6 gap-y-2 text-base sm:grid-cols-[220px_1fr]">
          <dt className="text-muted">{t.payroll.effectiveFrom}</dt>
          <dd className="text-fg">{formatDate(cur.effectiveFrom)}</dd>
          {rows.map(([label, value], i) => (
            <div key={`${label}-${i}`} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className="text-fg tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-base text-muted">{t.payroll.noProfile}</p>
      )}

      {view.history.length > 1 && (
        <div>
          <p className="label mb-2 font-bold text-muted">{t.payroll.history}</p>
          <ul className="space-y-1 text-sm text-fg">
            {view.history.map((v) => (
              <li key={v.id} className="tabular-nums">
                {formatDate(v.effectiveFrom)} · {money(v.baseAmount)}
                {suffix(v.payBasis)} · {t.payroll.payCycles[v.payCycle]}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-3 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="label font-bold text-fg">{t.payroll.bankTitle}</p>
          {canManage && !editingBank && (
            <Button variant="ghost" onClick={() => setEditingBank(true)}>
              {t.payroll.edit}
            </Button>
          )}
        </div>
        {editingBank ? (
          <BankForm
            employeeId={employeeId}
            initial={view.bankAccount}
            onCancel={() => setEditingBank(false)}
            onSaved={async () => {
              toast.push('success', t.payroll.bankSaved);
              setEditingBank(false);
              await data.reload();
            }}
          />
        ) : view.bankAccount ? (
          <p className="text-base text-fg tabular-nums">
            {view.bankAccount.bankName} · {view.bankAccount.accountNo} ·{' '}
            {view.bankAccount.accountName}
          </p>
        ) : (
          <p className="text-base text-muted">{t.payroll.noBank}</p>
        )}
      </div>
    </Card>
  );
}

type AllowanceRow = { label: string; kind: AllowanceKind; amount: string };

function ProfileForm({
  view,
  onCancel,
  onSaved,
}: {
  view: PayProfileView;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useT();
  const units = view.currencyMinorUnits;
  const cur = view.current;
  const isId = view.countryCode === 'ID';
  const [form, setForm] = useState({
    effectiveFrom: todayLocal(),
    payCycle: (cur?.payCycle ?? 'monthly') as PayCycle,
    payBasis: (cur?.payBasis ?? 'monthly') as PayBasis,
    baseAmount: cur ? toMajorInput(cur.baseAmount, units) : '',
    workDaysPerWeek: (cur?.workDaysPerWeek ?? 6) as 5 | 6,
    overtimeEligible: cur?.overtimeEligible ?? true,
    taxMethod: (cur?.taxMethod ?? 'policy') as TaxMethod | 'policy',
    ptkpStatus: cur?.ptkpStatus ?? '',
    sgResidency: cur?.sgResidency ?? '',
    sgShgFund: cur?.sgShgFund ?? '',
    pwmGrade: cur?.pwmGrade ?? '',
    // Identifiers start empty: left empty, the stored value is kept.
    taxId: '',
    bpjsTkNo: '',
    bpjsKesNo: '',
    dateOfBirth: '',
  });
  const [allowances, setAllowances] = useState<AllowanceRow[]>(
    cur?.allowances.map((a) => ({ ...a, amount: toMajorInput(a.amount, units) })) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    const base = fromMajorInput(form.baseAmount, units);
    const parsed = allowances.map((a) => ({ ...a, amount: fromMajorInput(a.amount, units) }));
    if (base === null || parsed.some((a) => a.amount === null || !a.label.trim())) {
      setError(t.payroll.invalidAmount);
      return;
    }
    const body: PayProfileRequest = {
      effectiveFrom: form.effectiveFrom,
      payCycle: form.payCycle,
      payBasis: form.payBasis,
      baseAmount: base,
      workDaysPerWeek: form.workDaysPerWeek,
      overtimeEligible: form.overtimeEligible,
      taxMethod: form.taxMethod === 'policy' ? null : form.taxMethod,
      allowances: parsed.map((a) => ({ label: a.label.trim(), kind: a.kind, amount: a.amount! })),
      ...(isId
        ? {
            ptkpStatus: (form.ptkpStatus || null) as PayProfileRequest['ptkpStatus'],
            ...(form.taxId.trim() && { taxId: form.taxId.trim() }),
            ...(form.bpjsTkNo.trim() && { bpjsTkNo: form.bpjsTkNo.trim() }),
            ...(form.bpjsKesNo.trim() && { bpjsKesNo: form.bpjsKesNo.trim() }),
          }
        : {
            sgResidency: (form.sgResidency || null) as PayProfileRequest['sgResidency'],
            sgShgFund: (form.sgShgFund || null) as PayProfileRequest['sgShgFund'],
            pwmGrade: form.pwmGrade.trim() || null,
            ...(form.dateOfBirth && { dateOfBirth: form.dateOfBirth }),
          }),
    };
    setSaving(true);
    setError(null);
    try {
      await api(`/tenant/employees/${view.employee.id}/pay-profile`, { method: 'PUT', body });
      await onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.common.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.payroll.effectiveFrom} htmlFor="pp-from">
          <Input
            id="pp-from"
            type="date"
            value={form.effectiveFrom}
            onChange={(e) => set('effectiveFrom', e.target.value)}
          />
        </Field>
        <Field label={t.payroll.payCycle} htmlFor="pp-cycle">
          <Select
            id="pp-cycle"
            value={form.payCycle}
            onChange={(e) => set('payCycle', e.target.value as PayCycle)}
          >
            {(['monthly', 'daily'] as const).map((k) => (
              <option key={k} value={k}>
                {t.payroll.payCycles[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.payroll.payBasis} htmlFor="pp-basis">
          <Select
            id="pp-basis"
            value={form.payBasis}
            onChange={(e) => set('payBasis', e.target.value as PayBasis)}
          >
            {(['monthly', 'daily', 'hourly'] as const).map((k) => (
              <option key={k} value={k}>
                {t.payroll.payBases[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`${t.payroll.baseAmount} (${view.currency})`} htmlFor="pp-base">
          <Input
            id="pp-base"
            inputMode="decimal"
            value={form.baseAmount}
            onChange={(e) => set('baseAmount', e.target.value)}
          />
        </Field>
        <Field label={t.payroll.workDays} htmlFor="pp-days">
          <Select
            id="pp-days"
            value={form.workDaysPerWeek}
            onChange={(e) => set('workDaysPerWeek', Number(e.target.value) as 5 | 6)}
          >
            {[5, 6].map((n) => (
              <option key={n} value={n}>
                {t.payroll.workDaysValue(n)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.payroll.taxMethod} htmlFor="pp-tax">
          <Select
            id="pp-tax"
            value={form.taxMethod}
            onChange={(e) => set('taxMethod', e.target.value as TaxMethod | 'policy')}
          >
            <option value="policy">{t.payroll.taxFollowsPolicy}</option>
            {(['gross', 'gross_up'] as const).map((k) => (
              <option key={k} value={k}>
                {t.payroll.taxMethods[k]}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex min-h-11 items-center gap-3 text-base text-fg">
          <input
            type="checkbox"
            className="size-5"
            checked={form.overtimeEligible}
            onChange={(e) => set('overtimeEligible', e.target.checked)}
          />
          {t.payroll.overtimeEligible}
        </label>
      </div>

      <div className="space-y-2">
        <p className="label font-bold text-muted">{t.payroll.allowances}</p>
        {allowances.map((a, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end">
            <Input
              aria-label={t.payroll.allowanceLabel}
              placeholder={t.payroll.allowanceLabel}
              value={a.label}
              onChange={(e) =>
                setAllowances((list) =>
                  list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                )
              }
            />
            <Select
              aria-label={t.payroll.allowances}
              value={a.kind}
              onChange={(e) =>
                setAllowances((list) =>
                  list.map((x, j) =>
                    j === i ? { ...x, kind: e.target.value as AllowanceKind } : x,
                  ),
                )
              }
            >
              {(['fixed', 'per_attendance'] as const).map((k) => (
                <option key={k} value={k}>
                  {t.payroll.allowanceKinds[k]}
                </option>
              ))}
            </Select>
            <Input
              aria-label={t.payroll.amount}
              placeholder={t.payroll.amount}
              inputMode="decimal"
              value={a.amount}
              onChange={(e) =>
                setAllowances((list) =>
                  list.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)),
                )
              }
            />
            <IconButton
              type="button"
              aria-label={t.payroll.remove}
              title={t.payroll.remove}
              onClick={() => setAllowances((list) => list.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-5" aria-hidden />
            </IconButton>
          </div>
        ))}
        <Button
          variant="ghost"
          className="px-0"
          onClick={() =>
            setAllowances((list) => [...list, { label: '', kind: 'fixed', amount: '' }])
          }
        >
          <Plus className="size-5" aria-hidden />
          {t.payroll.addAllowance}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {isId ? (
          <>
            <Field label={t.payroll.ptkp} htmlFor="pp-ptkp">
              <Select
                id="pp-ptkp"
                value={form.ptkpStatus}
                onChange={(e) => set('ptkpStatus', e.target.value)}
              >
                <option value="">—</option>
                {PTKP_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t.payroll.taxId}
              htmlFor="pp-taxid"
              hint={cur?.taxId ? t.payroll.keepHint : undefined}
            >
              <Input
                id="pp-taxid"
                inputMode="numeric"
                placeholder={cur?.taxId ?? ''}
                value={form.taxId}
                onChange={(e) => set('taxId', e.target.value)}
              />
            </Field>
            <Field
              label={t.payroll.bpjsTk}
              htmlFor="pp-bpjstk"
              hint={cur?.bpjsTkNo ? t.payroll.keepHint : undefined}
            >
              <Input
                id="pp-bpjstk"
                inputMode="numeric"
                placeholder={cur?.bpjsTkNo ?? ''}
                value={form.bpjsTkNo}
                onChange={(e) => set('bpjsTkNo', e.target.value)}
              />
            </Field>
            <Field
              label={t.payroll.bpjsKes}
              htmlFor="pp-bpjskes"
              hint={cur?.bpjsKesNo ? t.payroll.keepHint : undefined}
            >
              <Input
                id="pp-bpjskes"
                inputMode="numeric"
                placeholder={cur?.bpjsKesNo ?? ''}
                value={form.bpjsKesNo}
                onChange={(e) => set('bpjsKesNo', e.target.value)}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label={t.payroll.sgResidency} htmlFor="pp-res">
              <Select
                id="pp-res"
                value={form.sgResidency}
                onChange={(e) => set('sgResidency', e.target.value)}
              >
                <option value="">—</option>
                {SG_RESIDENCY.map((s) => (
                  <option key={s} value={s}>
                    {t.payroll.residencies[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.payroll.shg} htmlFor="pp-shg">
              <Select
                id="pp-shg"
                value={form.sgShgFund}
                onChange={(e) => set('sgShgFund', e.target.value)}
              >
                <option value="">—</option>
                {SG_SHG_FUNDS.map((s) => (
                  <option key={s} value={s}>
                    {s.toUpperCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.payroll.pwmGrade} htmlFor="pp-pwm">
              <Input
                id="pp-pwm"
                value={form.pwmGrade}
                onChange={(e) => set('pwmGrade', e.target.value)}
              />
            </Field>
            <Field
              label={t.payroll.dateOfBirth}
              htmlFor="pp-dob"
              hint={cur?.dateOfBirth ? t.payroll.keepHint : undefined}
            >
              <Input
                id="pp-dob"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => set('dateOfBirth', e.target.value)}
              />
            </Field>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button loading={saving} onClick={save}>
          {t.payroll.saveProfile}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t.common.cancel}
        </Button>
      </div>
    </div>
  );
}

function BankForm({
  employeeId,
  initial,
  onCancel,
  onSaved,
}: {
  employeeId: string;
  initial: PayProfileView['bankAccount'];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useT();
  const [bankName, setBankName] = useState(initial?.bankName ?? '');
  const [accountNo, setAccountNo] = useState('');
  const [accountName, setAccountName] = useState(initial?.accountName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api(`/tenant/employees/${employeeId}/bank-account`, {
        method: 'PUT',
        body: { bankName, accountNo, accountName },
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.common.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t.payroll.bankName} htmlFor="bank-name">
          <Input id="bank-name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
        </Field>
        <Field label={t.payroll.accountNo} htmlFor="bank-no">
          <Input
            id="bank-no"
            inputMode="numeric"
            placeholder={initial?.accountNo ?? ''}
            value={accountNo}
            onChange={(e) => setAccountNo(e.target.value)}
          />
        </Field>
        <Field label={t.payroll.accountName} htmlFor="bank-holder">
          <Input
            id="bank-holder"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button loading={saving} disabled={!bankName || !accountNo || !accountName} onClick={save}>
          {t.payroll.saveBank}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t.common.cancel}
        </Button>
      </div>
    </div>
  );
}
