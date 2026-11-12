import { Injectable } from '@nestjs/common';
import type { CountryPack } from '@xrostr/contracts';
import { countryPack } from './country-packs.js';
import { TenantRepository, type LegalEntity } from './ports.js';

export interface LegalEntityWithPack extends LegalEntity {
  pack: CountryPack;
}

/**
 * Public API of the tenancy module: the tenant's legal entities with the Country Pack that
 * governs each. Must run inside the tenant's unit of work.
 */
@Injectable()
export class LegalEntityDirectory {
  constructor(private readonly tenants: TenantRepository) {}

  async list(): Promise<LegalEntityWithPack[]> {
    const entities = await this.tenants.listLegalEntities();
    return entities.map((e) => ({ ...e, pack: countryPack(e.countryCode) }));
  }

  async find(id: string): Promise<LegalEntityWithPack | null> {
    return (await this.list()).find((e) => e.id === id) ?? null;
  }
}
