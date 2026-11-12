import type { CountryCode, Plan, TenantStatus, TenantSummary } from '@xrostr/contracts';
import type { LegalEntityDraft, TenantDraft } from '../domain/tenant.js';

export interface LegalEntity {
  id: string;
  name: string;
  countryCode: CountryCode;
  registrationNumber: string | null;
}

export abstract class TenantRepository {
  abstract slugExists(slug: string): Promise<boolean>;
  abstract insert(tenant: TenantDraft): Promise<string>;
  abstract list(): Promise<TenantSummary[]>;
  abstract findById(id: string): Promise<TenantSummary | null>;
  abstract update(
    id: string,
    changes: Partial<{ name: string; plan: Plan; status: TenantStatus }>,
  ): Promise<void>;
  /** Requires a tenant unit of work. */
  abstract insertLegalEntities(entities: readonly LegalEntityDraft[]): Promise<void>;
  /** Requires a tenant unit of work. */
  abstract listLegalEntities(): Promise<LegalEntity[]>;
}
