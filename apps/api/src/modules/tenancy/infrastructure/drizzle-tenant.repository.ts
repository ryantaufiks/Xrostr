import { Injectable } from '@nestjs/common';
import type { CountryCode, TenantSummary } from '@xrostr/contracts';
import { legalEntities, tenants } from '@xrostr/db';
import { asc, desc, eq } from 'drizzle-orm';
import { DatabaseContext } from '../../../shared/infrastructure/database/database-context.js';
import { TenantRepository, type LegalEntity } from '../application/ports.js';
import type { LegalEntityDraft, TenantDraft } from '../domain/tenant.js';

@Injectable()
export class DrizzleTenantRepository extends TenantRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async slugExists(slug: string): Promise<boolean> {
    const [row] = await this.ctx
      .executor()
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);
    return row !== undefined;
  }

  async insert(tenant: TenantDraft): Promise<string> {
    const [row] = await this.ctx
      .executor()
      .insert(tenants)
      .values({
        name: tenant.name,
        slug: tenant.slug,
        dataRegion: tenant.dataRegion,
        plan: tenant.plan,
      })
      .returning({ id: tenants.id });
    return row!.id;
  }

  async list(): Promise<TenantSummary[]> {
    const rows = await this.ctx.executor().select().from(tenants).orderBy(desc(tenants.createdAt));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      dataRegion: r.dataRegion,
      plan: r.plan,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async insertLegalEntities(entities: readonly LegalEntityDraft[]): Promise<void> {
    const tenantId = this.ctx.tenantId();
    await this.ctx
      .executor()
      .insert(legalEntities)
      .values(entities.map((e) => ({ ...e, tenantId })));
  }

  async listLegalEntities(): Promise<LegalEntity[]> {
    const rows = await this.ctx
      .executor()
      .select()
      .from(legalEntities)
      .orderBy(asc(legalEntities.name));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      countryCode: r.countryCode as CountryCode,
      registrationNumber: r.registrationNumber,
    }));
  }
}
