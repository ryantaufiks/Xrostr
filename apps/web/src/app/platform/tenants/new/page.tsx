'use client';

import {
  COUNTRY_CODES,
  createTenantRequestSchema,
  PLANS,
  type CountryCode,
  type CreateTenantRequest,
  type CreateTenantResponse,
  type DataRegion,
  type Plan,
  localeForRegion,
} from '@xrostr/contracts';
import { Check, Copy, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  buttonStyles,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDateTime, PLAN_LABELS, slugify } from '@/lib/format';
import { useT } from '@/lib/i18n';

interface EntityRow {
  name: string;
  countryCode: CountryCode;
  registrationNumber: string;
}

type Errors = Record<string, string>;

const emptyEntity = (countryCode: CountryCode = 'SG'): EntityRow => ({
  name: '',
  countryCode,
  registrationNumber: '',
});

export default function NewTenantPage() {
  const t = useT();
  const fieldMessages: Record<string, string> = {
    slug: t.platform.slugRule,
    legalEntities: t.platform.entityRequired,
  };
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [dataRegion, setDataRegion] = useState<DataRegion>('sg');
  const [plan, setPlan] = useState<Plan>('growth');
  const [entities, setEntities] = useState<EntityRow[]>([emptyEntity()]);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<
    (CreateTenantResponse & { slug: string; name: string }) | null
  >(null);

  function updateEntity(index: number, patch: Partial<EntityRow>) {
    setEntities((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const request: CreateTenantRequest = {
      name,
      slug,
      dataRegion,
      plan,
      legalEntities: entities.map((e) => ({
        name: e.name,
        countryCode: e.countryCode,
        ...(e.registrationNumber.trim() && { registrationNumber: e.registrationNumber }),
      })),
      firstAdmin: { email: adminEmail, fullName: adminName },
    };
    const parsed = createTenantRequestSchema.safeParse(request);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => {
            const path = i.path.join('.');
            return [path, fieldMessages[path] ?? i.message];
          }),
        ),
      );
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const response = await api<CreateTenantResponse>('/platform/tenants', { body: parsed.data });
      setCreated({ ...response, slug: parsed.data.slug, name: parsed.data.name });
    } catch (e) {
      if (e instanceof ApiError) {
        setFormError(e.message);
        if (e.code === 'slug_taken' || e.code === 'slug_reserved') setErrors({ slug: e.message });
        if (e.fieldErrors.length)
          setErrors(Object.fromEntries(e.fieldErrors.map((f) => [f.path, f.message])));
      } else {
        setFormError(t.common.error);
      }
    } finally {
      setLoading(false);
    }
  }

  if (created) return <TenantCreated created={created} />;

  return (
    <>
      <PageHeader title={t.platform.createTenant} description={t.platform.newSubtitle} />
      <form onSubmit={submit} className="space-y-6" noValidate>
        {formError && <Alert>{formError}</Alert>}

        <Section title={t.platform.companySection} description={t.platform.companySectionHint}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.platform.companyName} htmlFor="name" error={errors.name}>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugEdited) setSlug(slugify(e.target.value));
                }}
                aria-invalid={!!errors.name}
              />
            </Field>
            <Field
              label={t.platform.slug}
              htmlFor="slug"
              hint={t.platform.slugHint}
              error={errors.slug}
            >
              <Input
                id="slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase());
                  setSlugEdited(true);
                }}
                className="font-mono"
                aria-invalid={!!errors.slug}
              />
            </Field>
            <Field
              label={t.platform.dataRegion}
              htmlFor="region"
              hint={t.platform.regionHint(
                localeForRegion(dataRegion) === 'id' ? 'Bahasa Indonesia' : 'English',
              )}
            >
              <Select
                id="region"
                value={dataRegion}
                onChange={(e) => setDataRegion(e.target.value as DataRegion)}
              >
                {Object.entries(t.common.regions).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.platform.plan} htmlFor="plan">
              <Select id="plan" value={plan} onChange={(e) => setPlan(e.target.value as Plan)}>
                {PLANS.map((p) => (
                  <option key={p} value={p}>
                    {PLAN_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Section>

        <Section title={t.platform.entitySection} description={t.platform.entitySectionHint}>
          <div className="space-y-3">
            {entities.map((entity, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[1fr_160px_180px_auto] sm:items-start"
              >
                <Field
                  label={t.platform.entityName}
                  htmlFor={`entity-${index}-name`}
                  error={errors[`legalEntities.${index}.name`]}
                >
                  <Input
                    id={`entity-${index}-name`}
                    value={entity.name}
                    placeholder={
                      entity.countryCode === 'ID' ? 'PT Garda Aman' : 'Garda Aman Pte Ltd'
                    }
                    onChange={(e) => updateEntity(index, { name: e.target.value })}
                    aria-invalid={!!errors[`legalEntities.${index}.name`]}
                  />
                </Field>
                <Field label={t.platform.country} htmlFor={`entity-${index}-country`}>
                  <Select
                    id={`entity-${index}-country`}
                    value={entity.countryCode}
                    onChange={(e) =>
                      updateEntity(index, { countryCode: e.target.value as CountryCode })
                    }
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c} value={c}>
                        {t.common.countries[c]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t.platform.registration} htmlFor={`entity-${index}-reg`}>
                  <Input
                    id={`entity-${index}-reg`}
                    value={entity.registrationNumber}
                    placeholder={entity.countryCode === 'ID' ? 'NIB' : 'UEN'}
                    onChange={(e) => updateEntity(index, { registrationNumber: e.target.value })}
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  className="sm:mt-6.5"
                  aria-label={t.platform.removeEntity}
                  disabled={entities.length === 1}
                  onClick={() => setEntities((rows) => rows.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
            {errors.legalEntities && <p className="text-xs text-accent">{errors.legalEntities}</p>}
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setEntities((rows) => [
                  ...rows,
                  emptyEntity(rows.at(-1)?.countryCode === 'SG' ? 'ID' : 'SG'),
                ])
              }
            >
              <Plus className="size-4" aria-hidden />
              {t.platform.addEntity}
            </Button>
          </div>
        </Section>

        <Section title={t.platform.adminSection} description={t.platform.adminSectionHint}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t.platform.fullName}
              htmlFor="admin-name"
              error={errors['firstAdmin.fullName']}
            >
              <Input
                id="admin-name"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                aria-invalid={!!errors['firstAdmin.fullName']}
              />
            </Field>
            <Field
              label={t.platform.email}
              htmlFor="admin-email"
              error={errors['firstAdmin.email']}
            >
              <Input
                id="admin-email"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                aria-invalid={!!errors['firstAdmin.email']}
              />
            </Field>
          </div>
        </Section>

        <div className="flex justify-end gap-2">
          <Link href="/platform/tenants" className={buttonStyles('secondary')}>
            {t.common.cancel}
          </Link>
          <Button type="submit" loading={loading}>
            {t.platform.createTenant}
          </Button>
        </div>
      </form>
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[240px_1fr]">
      <div>
        <h2 className="label font-bold text-fg">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <div>{children}</div>
    </Card>
  );
}

function TenantCreated({
  created,
}: {
  created: CreateTenantResponse & { slug: string; name: string };
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/invite?token=${encodeURIComponent(created.inviteToken)}&tenant=${encodeURIComponent(created.slug)}`;

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <PageHeader
        title={t.platform.createdTitle}
        description={t.platform.createdSubtitle(created.name)}
      />
      <Card className="space-y-5 p-6">
        <Alert tone="success">
          {t.platform.createdInvite} <strong>{formatDateTime(created.inviteExpiresAt)}</strong>.
        </Alert>
        <div>
          <p className="mb-1.5 text-sm font-medium text-fg">{t.platform.inviteLink}</p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={link}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button type="button" variant="secondary" onClick={copy}>
              {copied ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
              {copied ? t.platform.copied : t.platform.copy}
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted">{t.platform.inviteShownOnce}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/platform/tenants" className={buttonStyles('primary')}>
            {t.platform.toList}
          </Link>
        </div>
      </Card>
    </>
  );
}
