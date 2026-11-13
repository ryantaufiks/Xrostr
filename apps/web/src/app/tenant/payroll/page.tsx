'use client';

import type { PayPolicyRequest, PayPolicyView } from '@xrostr/contracts';
import { useState } from 'react';
import { useToast } from '@/components/toast';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { formatMoney, fromMajorInput, toMajorInput } from '@/lib/money';
import { usePrincipal } from '@/lib/principal-context';
import { useData } from '@/lib/use-data';

/** Payroll settings: each legal entity's pay policy. */
export default function PayrollPage() {
  const t = useT();
  const policies = useData<PayPolicyView[]>('/tenant/pay-policies');
  return (
    <>
      <PageHeader title={t.payroll.title} description={t.payroll.description} />
      {policies.error && <Alert>{policies.error}</Alert>}
      {!policies.data && !policies.error && (
        <Card className="space-y-3 p-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-3/4" />
        </Card>
      )}
      <div className="space-y-4">
        {policies.data?.map((p) => (
          <PolicyCard key={p.legalEntity.id} policy={p} onSaved={policies.reload} />
        ))}
      </div>
    </>
  );
}

function PolicyCard({ policy, onSaved }: { policy: PayPolicyView; onSaved: () => Promise<void> }) {
  const t = useT();
  const toast = useToast();
  const { permissions } = usePrincipal();
  const canManage = permissions.includes('payroll.manage');
  const [editing, setEditing] = useState(false);
  const money = (n: number) => formatMoney(n, policy.currency, policy.currencyMinorUnits);

  const rows: [string, string][] = [
    [t.payroll.overtime, policy.overtimeEnabled ? t.payroll.overtimeOn : t.payroll.overtimeOff],
    [t.payroll.rounding, t.payroll.roundingValue(policy.roundingMinutes)],
    [t.payroll.lateGrace, String(policy.lateGraceMinutes)],
    [t.payroll.lateDeduction, t.payroll.lateDeductions[policy.lateDeduction]!],
    [
      t.payroll.standby,
      `${money(policy.standbyRate)} ${t.payroll.standbyUnits[policy.standbyUnit]}`,
    ],
    [t.payroll.callout, money(policy.calloutAmount)],
    [t.payroll.nightAllowance, money(policy.nightAllowance)],
    [t.payroll.taxMethod, t.payroll.taxMethods[policy.taxMethod]!],
    [t.payroll.bankFormat, t.payroll.banks[policy.bankFormat ?? 'none']!],
    [t.payroll.payDay, String(policy.payDay)],
  ];

  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-fg">{policy.legalEntity.name}</h2>
          <p className="text-sm text-muted">
            {policy.legalEntity.countryCode} · {policy.currency}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!policy.saved && <Badge>{t.payroll.usingDefaults}</Badge>}
          {canManage && !editing && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t.payroll.edit}
            </Button>
          )}
        </div>
      </div>
      {editing ? (
        <PolicyForm
          policy={policy}
          onCancel={() => setEditing(false)}
          onSaved={async () => {
            toast.push('success', t.payroll.saved);
            setEditing(false);
            await onSaved();
          }}
        />
      ) : (
        <dl className="grid gap-x-6 gap-y-2 text-base sm:grid-cols-[220px_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className="text-fg">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

function PolicyForm({
  policy,
  onCancel,
  onSaved,
}: {
  policy: PayPolicyView;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useT();
  const units = policy.currencyMinorUnits;
  const [form, setForm] = useState({
    overtimeEnabled: policy.overtimeEnabled,
    roundingMinutes: policy.roundingMinutes,
    lateGraceMinutes: String(policy.lateGraceMinutes),
    lateDeduction: policy.lateDeduction,
    standbyRate: toMajorInput(policy.standbyRate, units),
    standbyUnit: policy.standbyUnit,
    calloutAmount: toMajorInput(policy.calloutAmount, units),
    nightAllowance: toMajorInput(policy.nightAllowance, units),
    taxMethod: policy.taxMethod,
    bankFormat: policy.bankFormat ?? 'none',
    payDay: String(policy.payDay),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const id = (name: string) => `${policy.legalEntity.id}-${name}`;

  async function save() {
    const standbyRate = fromMajorInput(form.standbyRate || '0', units);
    const calloutAmount = fromMajorInput(form.calloutAmount || '0', units);
    const nightAllowance = fromMajorInput(form.nightAllowance || '0', units);
    if (standbyRate === null || calloutAmount === null || nightAllowance === null) {
      setError(t.payroll.invalidAmount);
      return;
    }
    const body: PayPolicyRequest = {
      overtimeEnabled: form.overtimeEnabled,
      roundingMinutes: form.roundingMinutes,
      lateGraceMinutes: Number(form.lateGraceMinutes) || 0,
      lateDeduction: form.lateDeduction,
      standbyRate,
      standbyUnit: form.standbyUnit,
      calloutAmount,
      nightAllowance,
      taxMethod: form.taxMethod,
      bankFormat: form.bankFormat === 'none' ? null : (form.bankFormat as 'mandiri' | 'dbs'),
      payDay: Number(form.payDay) || 1,
    };
    setSaving(true);
    setError(null);
    try {
      await api(`/tenant/legal-entities/${policy.legalEntity.id}/pay-policy`, {
        method: 'PUT',
        body,
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.payroll.overtime} htmlFor={id('ot')}>
          <Select
            id={id('ot')}
            value={form.overtimeEnabled ? 'on' : 'off'}
            onChange={(e) => set('overtimeEnabled', e.target.value === 'on')}
          >
            <option value="on">{t.payroll.overtimeOn}</option>
            <option value="off">{t.payroll.overtimeOff}</option>
          </Select>
        </Field>
        <Field label={t.payroll.rounding} htmlFor={id('round')}>
          <Select
            id={id('round')}
            value={form.roundingMinutes}
            onChange={(e) =>
              set('roundingMinutes', Number(e.target.value) as PayPolicyRequest['roundingMinutes'])
            }
          >
            {[1, 5, 15, 30].map((n) => (
              <option key={n} value={n}>
                {t.payroll.roundingValue(n)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.payroll.lateGrace} htmlFor={id('grace')}>
          <Input
            id={id('grace')}
            type="number"
            min={0}
            max={60}
            value={form.lateGraceMinutes}
            onChange={(e) => set('lateGraceMinutes', e.target.value)}
          />
        </Field>
        <Field label={t.payroll.lateDeduction} htmlFor={id('late')}>
          <Select
            id={id('late')}
            value={form.lateDeduction}
            onChange={(e) => set('lateDeduction', e.target.value as 'none' | 'per_minute')}
          >
            {(['none', 'per_minute'] as const).map((k) => (
              <option key={k} value={k}>
                {t.payroll.lateDeductions[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`${t.payroll.standby} (${policy.currency})`} htmlFor={id('standby')}>
          <div className="flex gap-2">
            <Input
              id={id('standby')}
              inputMode="decimal"
              value={form.standbyRate}
              onChange={(e) => set('standbyRate', e.target.value)}
            />
            <Select
              aria-label={t.payroll.standby}
              value={form.standbyUnit}
              onChange={(e) => set('standbyUnit', e.target.value as 'hour' | 'shift')}
            >
              {(['shift', 'hour'] as const).map((k) => (
                <option key={k} value={k}>
                  {t.payroll.standbyUnits[k]}
                </option>
              ))}
            </Select>
          </div>
        </Field>
        <Field label={`${t.payroll.callout} (${policy.currency})`} htmlFor={id('callout')}>
          <Input
            id={id('callout')}
            inputMode="decimal"
            value={form.calloutAmount}
            onChange={(e) => set('calloutAmount', e.target.value)}
          />
        </Field>
        <Field label={`${t.payroll.nightAllowance} (${policy.currency})`} htmlFor={id('night')}>
          <Input
            id={id('night')}
            inputMode="decimal"
            value={form.nightAllowance}
            onChange={(e) => set('nightAllowance', e.target.value)}
          />
        </Field>
        <Field label={t.payroll.taxMethod} htmlFor={id('tax')}>
          <Select
            id={id('tax')}
            value={form.taxMethod}
            onChange={(e) => set('taxMethod', e.target.value as 'gross' | 'gross_up')}
          >
            {(['gross', 'gross_up'] as const).map((k) => (
              <option key={k} value={k}>
                {t.payroll.taxMethods[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.payroll.bankFormat} htmlFor={id('bank')}>
          <Select
            id={id('bank')}
            value={form.bankFormat}
            onChange={(e) => set('bankFormat', e.target.value)}
          >
            {(['mandiri', 'dbs', 'none'] as const).map((k) => (
              <option key={k} value={k}>
                {t.payroll.banks[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.payroll.payDay} htmlFor={id('payday')}>
          <Input
            id={id('payday')}
            type="number"
            min={1}
            max={31}
            value={form.payDay}
            onChange={(e) => set('payDay', e.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button loading={saving} onClick={save}>
          {t.payroll.save}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t.common.cancel}
        </Button>
      </div>
    </div>
  );
}
