'use client';

import {
  COUNTRY_CODES,
  PLANS,
  type CountryCode,
  type Plan,
  type ReissuedAdminInvite,
  type TenantDetail,
} from '@xrostr/contracts';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { InviteShare } from '@/components/invite-share';
import { useConfirm } from '@/components/confirm-dialog';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  buttonStyles,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { PLAN_LABELS } from '@/lib/format';
import { useT } from '@/lib/i18n';

type Message = { tone: 'error' | 'success'; text: string } | null;
const failure = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export default function TenantDetailPage() {
  const t = useT();
  const { confirm, confirmDialog } = useConfirm();
  const { id } = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    api<TenantDetail>(`/platform/tenants/${id}`)
      .then(setTenant)
      .catch((e: unknown) => setLoadError(failure(e, t.common.error)));
  }, [id]);

  async function toggleStatus() {
    if (!tenant) return;
    const suspend = tenant.status === 'active';
    if (
      suspend &&
      !(await confirm({
        message: t.platform.suspendConfirm(tenant.name),
        confirmLabel: t.platform.suspend,
      }))
    )
      return;
    setToggling(true);
    setMessage(null);
    try {
      setTenant(
        await api<TenantDetail>(`/platform/tenants/${id}`, {
          method: 'PATCH',
          body: { status: suspend ? 'suspended' : 'active' },
        }),
      );
      setMessage({
        tone: 'success',
        text: suspend ? t.platform.suspendedDone : t.platform.reactivatedDone,
      });
    } catch (e) {
      setMessage({ tone: 'error', text: failure(e, t.common.error) });
    } finally {
      setToggling(false);
    }
  }

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!tenant) return <Spinner />;
  const active = tenant.status === 'active';

  return (
    <>
      {confirmDialog}
      <Link href="/platform/tenants" className={buttonStyles('ghost', 'mb-4 -ml-4')}>
        <ArrowLeft className="size-5" aria-hidden />
        {t.platform.allTenants}
      </Link>
      <PageHeader
        title={tenant.name}
        description={t.platform.detailSubtitle(
          tenant.slug,
          t.common.regions[tenant.dataRegion] ?? tenant.dataRegion,
        )}
        actions={
          <Button variant="secondary" loading={toggling} onClick={toggleStatus}>
            {active ? t.platform.suspend : t.platform.reactivate}
          </Button>
        }
      />
      <div className="space-y-6">
        <div>
          <Badge tone={active ? 'active' : 'warn'}>
            {active ? t.platform.active : t.platform.suspended}
          </Badge>
        </div>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <ProfileForm tenant={tenant} onSaved={setTenant} />
        <LegalEntities tenant={tenant} onSaved={setTenant} />
        <Admins tenant={tenant} />
      </div>
    </>
  );
}

function ProfileForm({
  tenant,
  onSaved,
}: {
  tenant: TenantDetail;
  onSaved: (tenant: TenantDetail) => void;
}) {
  const t = useT();
  const [name, setName] = useState(tenant.name);
  const [plan, setPlan] = useState(tenant.plan as Plan);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const dirty = name.trim() !== tenant.name || plan !== tenant.plan;

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      onSaved(
        await api<TenantDetail>(`/platform/tenants/${tenant.id}`, {
          method: 'PATCH',
          body: { name: name.trim(), plan },
        }),
      );
      setMessage({ tone: 'success', text: t.platform.saved });
    } catch (e) {
      setMessage({ tone: 'error', text: failure(e, t.common.error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <form onSubmit={save} className="space-y-5">
        <h2 className="font-display text-xl font-bold">{t.platform.profile}</h2>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t.platform.companyName} htmlFor="tenant-name">
            <Input
              id="tenant-name"
              required
              minLength={2}
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={t.platform.plan} htmlFor="tenant-plan">
            <Select id="tenant-plan" value={plan} onChange={(e) => setPlan(e.target.value as Plan)}>
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {PLAN_LABELS[p] ?? p}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-sm text-muted">{t.platform.fixedFields}</p>
        <Button type="submit" loading={saving} disabled={!dirty}>
          {t.common.save}
        </Button>
      </form>
    </Card>
  );
}

function LegalEntities({
  tenant,
  onSaved,
}: {
  tenant: TenantDetail;
  onSaved: (tenant: TenantDetail) => void;
}) {
  const t = useT();
  const [form, setForm] = useState({
    name: '',
    countryCode: 'ID' as CountryCode,
    registrationNumber: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      onSaved(
        await api<TenantDetail>(`/platform/tenants/${tenant.id}/legal-entities`, {
          body: {
            name: form.name.trim(),
            countryCode: form.countryCode,
            registrationNumber: form.registrationNumber.trim() || undefined,
          },
        }),
      );
      setMessage({ tone: 'success', text: t.platform.entityAdded(form.name.trim()) });
      setForm({ ...form, name: '', registrationNumber: '' });
    } catch (e) {
      setMessage({ tone: 'error', text: failure(e, t.common.error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="p-5 sm:p-6">
        <h2 className="font-display text-xl font-bold">{t.platform.entitySection}</h2>
        <p className="mt-1 text-sm text-muted">{t.platform.entitiesHint}</p>
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {tenant.legalEntities.map((e) => (
          <li
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6"
          >
            <span className="text-lg text-fg">{e.name}</span>
            <span className="text-base text-muted">
              {t.common.countries[e.countryCode] ?? e.countryCode}
              {e.registrationNumber && ` · ${e.registrationNumber}`}
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="space-y-5 p-5 sm:p-6">
        <h3 className="label font-bold text-muted">{t.platform.addEntityTitle}</h3>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label={t.platform.name} htmlFor="entity-name">
            <Input
              id="entity-name"
              required
              minLength={2}
              maxLength={200}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label={t.platform.country} htmlFor="entity-country">
            <Select
              id="entity-country"
              value={form.countryCode}
              onChange={(e) => setForm({ ...form, countryCode: e.target.value as CountryCode })}
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c} value={c}>
                  {t.common.countries[c] ?? c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.platform.registrationOptional} htmlFor="entity-reg">
            <Input
              id="entity-reg"
              maxLength={50}
              value={form.registrationNumber}
              onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
            />
          </Field>
        </div>
        <Button type="submit" variant="secondary" loading={saving}>
          {t.common.add}
        </Button>
      </form>
    </Card>
  );
}

function Admins({ tenant }: { tenant: TenantDetail }) {
  const t = useT();
  const [issued, setIssued] = useState<(ReissuedAdminInvite & { userId: string }) | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reissue(userId: string) {
    setBusy(userId);
    setError(null);
    try {
      const res = await api<ReissuedAdminInvite>(
        `/platform/tenants/${tenant.id}/admins/${userId}/invite`,
        { method: 'POST' },
      );
      setIssued({ ...res, userId });
    } catch (e) {
      setError(failure(e, t.common.error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <div className="p-5 sm:p-6">
        <h2 className="font-display text-xl font-bold">{t.platform.adminsTitle}</h2>
        <p className="mt-1 text-sm text-muted">{t.platform.adminsHint}</p>
      </div>
      {error && (
        <div className="px-5 pb-4 sm:px-6">
          <Alert>{error}</Alert>
        </div>
      )}
      <ul className="divide-y divide-line border-t border-line">
        {tenant.admins.map((a) => (
          <li key={a.userId} className="space-y-3 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg text-fg">{a.fullName}</p>
                <p className="text-base break-all text-muted">{a.email}</p>
              </div>
              <Badge tone={a.status === 'active' ? 'active' : 'warn'}>
                {t.platform.accountStatus[a.status] ?? a.status}
              </Badge>
            </div>
            {a.status === 'invited' && (
              <Button
                variant="secondary"
                loading={busy === a.userId}
                onClick={() => reissue(a.userId)}
              >
                {t.platform.reissueInvite}
              </Button>
            )}
            {issued?.userId === a.userId && (
              <InviteShare
                token={issued.inviteToken}
                expiresAt={issued.inviteExpiresAt}
                tenantSlug={tenant.slug}
                name={a.fullName}
              />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
