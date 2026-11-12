import type { CountryCode, DataRegion, Plan } from '@inroster/contracts';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';

export interface LegalEntityDraft {
  readonly name: string;
  readonly countryCode: CountryCode;
  readonly registrationNumber: string | null;
}

export interface TenantDraft {
  readonly name: string;
  readonly slug: string;
  readonly dataRegion: DataRegion;
  readonly plan: Plan;
  readonly legalEntities: readonly LegalEntityDraft[];
}

const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'platform',
  'www',
  'support',
  'status',
]);

/** Business rules for a new tenant beyond request-shape validation. */
export function draftTenant(input: {
  name: string;
  slug: string;
  dataRegion: DataRegion;
  plan: Plan;
  legalEntities: readonly {
    name: string;
    countryCode: CountryCode;
    registrationNumber?: string | undefined;
  }[];
}): Result<TenantDraft> {
  if (RESERVED_SLUGS.has(input.slug)) {
    return err(
      new DomainError('validation', 'slug_reserved', `The slug "${input.slug}" is reserved.`),
    );
  }
  if (input.legalEntities.length === 0) {
    return err(
      new DomainError(
        'validation',
        'legal_entity_required',
        'A tenant needs at least one legal entity.',
      ),
    );
  }
  const names = input.legalEntities.map((e) => e.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    return err(
      new DomainError('validation', 'duplicate_legal_entity', 'Legal entity names must be unique.'),
    );
  }
  return ok({
    name: input.name,
    slug: input.slug,
    dataRegion: input.dataRegion,
    plan: input.plan,
    legalEntities: input.legalEntities.map((e) => ({
      name: e.name,
      countryCode: e.countryCode,
      registrationNumber: e.registrationNumber ?? null,
    })),
  });
}
