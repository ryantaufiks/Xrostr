import type { CountryCode, TenantSummary } from '@inroster/contracts';
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
  /** Requires a tenant unit of work. */
  abstract insertLegalEntities(entities: readonly LegalEntityDraft[]): Promise<void>;
  /** Requires a tenant unit of work. */
  abstract listLegalEntities(): Promise<LegalEntity[]>;
}
