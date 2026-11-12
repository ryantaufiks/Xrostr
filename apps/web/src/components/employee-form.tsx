'use client';

import {
  ASSIGNMENT_TYPES,
  EMPLOYMENT_TYPES,
  SYSTEM_ROLES,
  type AssignmentType,
  type EmployeeView,
  type EmploymentType,
  type LocationView,
  type SystemRole,
} from '@xrostr/contracts';
import { useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { employmentLabel, fieldErrors, roleLabel, type LegalEntityOption } from '@/lib/workforce';
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  SegmentedControl,
  Select,
  segmentedOptionStyles,
} from './ui';

interface Values {
  fullName: string;
  email: string;
  phone: string;
  employeeNo: string;
  legalEntityId: string;
  locationId: string;
  jobTitle: string;
  employmentType: EmploymentType;
  startDate: string;
  role: SystemRole;
  assignmentType: AssignmentType;
  canRelieve: boolean;
  siteIds: string[];
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * New employee (all fields) or edit (personal and assignment fields; contract entity, number,
 * email and role are fixed after creation).
 */
export function EmployeeForm<T>({
  entities,
  locations,
  employee,
  onSaved,
}: {
  entities: LegalEntityOption[];
  locations: LocationView[];
  employee?: EmployeeView;
  /** `saved` echoes the name and phone that were sent, for follow-up screens. */
  onSaved: (result: T, saved: { fullName: string; phone: string | null }) => void;
}) {
  const t = useT();
  const [values, setValues] = useState<Values>({
    fullName: employee?.fullName ?? '',
    email: employee?.email ?? '',
    phone: employee?.phone ?? '',
    employeeNo: employee?.employeeNo ?? '',
    legalEntityId: employee?.legalEntity.id ?? entities[0]?.id ?? '',
    locationId: employee?.location?.id ?? '',
    jobTitle: employee?.jobTitle ?? '',
    employmentType: employee?.employmentType ?? 'full_time',
    startDate: employee?.startDate ?? today(),
    role: (employee?.role as SystemRole) ?? 'employee',
    assignmentType: employee?.assignmentType ?? 'fixed',
    canRelieve: employee?.canRelieve ?? false,
    siteIds: employee?.siteIds ?? [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  const sites = locations.filter(
    (l) =>
      l.legalEntity.id === values.legalEntityId &&
      (l.status === 'active' || l.id === values.locationId),
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setErrors({});
    const shared = {
      fullName: values.fullName,
      phone: values.phone.trim() || null,
      locationId: values.locationId || null,
      jobTitle: values.jobTitle,
      employmentType: values.employmentType,
      assignmentType: values.assignmentType,
      canRelieve: values.canRelieve,
      // Only sites of the chosen legal entity can be cleared.
      siteIds: values.siteIds.filter((id) => sites.some((s) => s.id === id)),
    };
    setSaving(true);
    try {
      const result = employee
        ? await api<T>(`/tenant/employees/${employee.id}`, { method: 'PATCH', body: shared })
        : await api<T>('/tenant/employees', {
            body: {
              ...shared,
              email: values.email,
              employeeNo: values.employeeNo,
              legalEntityId: values.legalEntityId,
              startDate: values.startDate,
              role: values.role,
            },
          });
      onSaved(result, { fullName: values.fullName.trim(), phone: shared.phone });
    } catch (e) {
      if (e instanceof ApiError) {
        const fields = fieldErrors(e.fieldErrors);
        if (e.code === 'email_taken') fields.email = e.message;
        if (e.code === 'employee_no_taken') fields.employeeNo = e.message;
        setErrors(fields);
        setFormError(e.message);
      } else {
        setFormError(t.common.error);
      }
    } finally {
      setSaving(false);
    }
  }

  const locked = !!employee;
  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {formError && <Alert>{formError}</Alert>}
      <Section title={t.workforce.personal}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t.workforce.fullName} htmlFor="fullName" error={errors.fullName}>
            <Input
              id="fullName"
              value={values.fullName}
              onChange={(e) => set({ fullName: e.target.value })}
            />
          </Field>
          <Field
            label={t.workforce.phone}
            htmlFor="phone"
            hint={t.workforce.phoneHint}
            error={errors.phone}
          >
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              value={values.phone}
              placeholder="+62812…"
              onChange={(e) => set({ phone: e.target.value })}
            />
          </Field>
          <Field
            label={t.workforce.email}
            htmlFor="email"
            hint={locked ? t.workforce.emailLocked : t.workforce.emailHint}
            error={errors.email}
          >
            <Input
              id="email"
              type="email"
              value={values.email}
              disabled={locked}
              onChange={(e) => set({ email: e.target.value })}
            />
          </Field>
          <Field label={t.workforce.employeeNo} htmlFor="employeeNo" error={errors.employeeNo}>
            <Input
              id="employeeNo"
              value={values.employeeNo}
              disabled={locked}
              className="font-mono"
              onChange={(e) => set({ employeeNo: e.target.value.toUpperCase() })}
            />
          </Field>
        </div>
      </Section>

      <Section title={t.workforce.work}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t.workforce.contractEntity} htmlFor="entity">
            <Select
              id="entity"
              value={values.legalEntityId}
              disabled={locked}
              onChange={(e) => set({ legalEntityId: e.target.value, locationId: '' })}
            >
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({t.common.countries[e.countryCode] ?? e.countryCode})
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t.workforce.mainSite}
            htmlFor="site"
            hint={t.workforce.mainSiteHint}
            error={errors.locationId}
          >
            <Select
              id="site"
              value={values.locationId}
              onChange={(e) => set({ locationId: e.target.value })}
            >
              <option value="">{t.workforce.unassigned}</option>
              {sites.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.workforce.jobTitle} htmlFor="jobTitle" error={errors.jobTitle}>
            <Input
              id="jobTitle"
              value={values.jobTitle}
              placeholder="Security Officer"
              onChange={(e) => set({ jobTitle: e.target.value })}
            />
          </Field>
          <Field label={t.workforce.employmentType} htmlFor="employmentType">
            <Select
              id="employmentType"
              value={values.employmentType}
              onChange={(e) => set({ employmentType: e.target.value as EmploymentType })}
            >
              {EMPLOYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {employmentLabel(type)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.workforce.startDate} htmlFor="startDate" error={errors.startDate}>
            <Input
              id="startDate"
              type="date"
              value={values.startDate}
              disabled={locked}
              onChange={(e) => set({ startDate: e.target.value })}
            />
          </Field>
          <Field
            label={t.workforce.role}
            htmlFor="role"
            hint={locked ? undefined : t.workforce.roleHint}
          >
            <Select
              id="role"
              value={values.role}
              disabled={locked}
              onChange={(e) => set({ role: e.target.value as SystemRole })}
            >
              {SYSTEM_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="space-y-2">
          <span className="label block font-bold text-muted">{t.workforce.assignmentType}</span>
          <SegmentedControl
            className="grid max-w-sm grid-cols-2"
            role="radiogroup"
            aria-label={t.workforce.assignmentType}
          >
            {ASSIGNMENT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={values.assignmentType === type}
                onClick={() => set({ assignmentType: type })}
                className={segmentedOptionStyles(values.assignmentType === type)}
              >
                {type === 'fixed' ? t.workforce.fixed : t.workforce.roving}
              </button>
            ))}
          </SegmentedControl>
        </div>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={values.canRelieve}
            onChange={(e) => set({ canRelieve: e.target.checked })}
            className="size-5"
          />
          <span className="text-base text-fg">
            {t.workforce.canRelieve}
            <span className="block text-sm text-muted">{t.workforce.canRelieveHint}</span>
          </span>
        </label>
        {sites.length > 1 && (
          <fieldset className="space-y-2">
            <legend className="label font-bold text-muted">{t.workforce.allowedSites}</legend>
            <p className="text-sm text-muted">{t.workforce.allowedSitesHint}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {sites.map((s) => (
                <label key={s.id} className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={s.id === values.locationId || values.siteIds.includes(s.id)}
                    disabled={s.id === values.locationId}
                    onChange={(e) =>
                      set({
                        siteIds: e.target.checked
                          ? [...values.siteIds, s.id]
                          : values.siteIds.filter((id) => id !== s.id),
                      })
                    }
                  />
                  <span className="text-base text-fg">
                    {s.name} <span className="font-mono text-sm text-muted">{s.code}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </Section>

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          {locked ? t.workforce.saveChanges : t.workforce.saveAndInvite}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <h2 className="label font-bold text-fg">{title}</h2>
      {children}
    </Card>
  );
}
