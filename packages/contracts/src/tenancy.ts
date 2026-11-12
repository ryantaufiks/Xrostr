import { z } from 'zod';
import { COUNTRY_CODES, DATA_REGIONS } from './country.js';

export const PLANS = ['starter', 'growth', 'enterprise'] as const;
export type Plan = (typeof PLANS)[number];

export const tenantSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, 'Use 3-40 lowercase letters, digits or hyphens');

export const TENANT_STATUSES = ['active', 'suspended'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const legalEntityInputSchema = z.object({
  name: z.string().trim().min(2).max(200),
  countryCode: z.enum(COUNTRY_CODES),
  registrationNumber: z.string().trim().max(50).optional(),
});
export type LegalEntityInput = z.infer<typeof legalEntityInputSchema>;

export const createTenantRequestSchema = z.object({
  name: z.string().trim().min(2).max(200),
  slug: tenantSlugSchema,
  dataRegion: z.enum(DATA_REGIONS),
  plan: z.enum(PLANS),
  legalEntities: z.array(legalEntityInputSchema).min(1, 'A tenant needs at least one legal entity'),
  firstAdmin: z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    fullName: z.string().trim().min(2).max(200),
  }),
});
export type CreateTenantRequest = z.infer<typeof createTenantRequestSchema>;

export interface CreateTenantResponse {
  tenantId: string;
  firstAdminUserId: string;
  /** One-time token; delivered by email once notifications exist (Phase 1). */
  inviteToken: string;
  inviteExpiresAt: string;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  dataRegion: string;
  plan: string;
  status: string;
  createdAt: string;
}

/** Slug and data region are fixed: staff sign in with the slug, and data stays in its region. */
export const updateTenantSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    plan: z.enum(PLANS).optional(),
    status: z.enum(TENANT_STATUSES).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to change' });
export type UpdateTenantRequest = z.infer<typeof updateTenantSchema>;

export interface TenantAdminView {
  userId: string;
  email: string;
  fullName: string;
  status: 'invited' | 'active' | 'disabled';
}

export interface TenantDetail extends TenantSummary {
  legalEntities: {
    id: string;
    name: string;
    countryCode: string;
    registrationNumber: string | null;
  }[];
  admins: TenantAdminView[];
}

export interface ReissuedAdminInvite {
  inviteToken: string;
  inviteExpiresAt: string;
}
