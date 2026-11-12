import { describe, expect, it } from 'vitest';
import { draftTenant } from './tenant.js';

const valid = {
  name: 'Garda Aman',
  slug: 'garda-aman',
  dataRegion: 'id' as const,
  plan: 'growth' as const,
  legalEntities: [
    { name: 'PT Garda Aman', countryCode: 'ID' as const },
    { name: 'Garda Aman Pte Ltd', countryCode: 'SG' as const, registrationNumber: '2026123456K' },
  ],
};

describe('draftTenant', () => {
  it('accepts a tenant with entities in several countries', () => {
    const result = draftTenant(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.legalEntities[0]!.registrationNumber).toBeNull();
  });

  it('rejects reserved slugs', () => {
    const result = draftTenant({ ...valid, slug: 'platform' });
    expect(result.ok || result.error.code).toBe('slug_reserved');
  });

  it('rejects duplicate legal entity names, ignoring case', () => {
    const result = draftTenant({
      ...valid,
      legalEntities: [
        { name: 'PT Garda', countryCode: 'ID' },
        { name: 'pt garda', countryCode: 'SG' },
      ],
    });
    expect(result.ok || result.error.code).toBe('duplicate_legal_entity');
  });
});
