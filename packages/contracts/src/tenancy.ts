import { z } from 'zod';
import { COUNTRY_CODES, DATA_REGIONS } from './country.js';

export const PLANS = ['starter', 'growth', 'enterprise'] as const;
export type Plan = (typeof PLANS)[number];

export const tenantSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, 'Use 3-40 lowercase letters, digits or hyphens');

export const createTenantRequestSchema = z.object({
  name: z.string().trim().min(2).max(200),
  slug: tenantSlugSchema,
  dataRegion: z.enum(DATA_REGIONS),
  plan: z.enum(PLANS),
  legalEntities: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(200),
        countryCode: z.enum(COUNTRY_CODES),
        registrationNumber: z.string().trim().max(50).optional(),
      }),
    )
    .min(1, 'A tenant needs at least one legal entity'),
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
