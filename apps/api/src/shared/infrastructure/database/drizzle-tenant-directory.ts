import { Injectable } from '@nestjs/common';
import { tenants } from '@inroster/db';
import { and, eq } from 'drizzle-orm';
import { TenantDirectory } from '../../application/ports.js';
import { DatabaseContext } from './database-context.js';

@Injectable()
export class DrizzleTenantDirectory extends TenantDirectory {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async findActiveIdBySlug(slug: string): Promise<string | null> {
    const [row] = await this.ctx
      .executor()
      .select({ id: tenants.id })
      .from(tenants)
      .where(and(eq(tenants.slug, slug), eq(tenants.status, 'active')))
      .limit(1);
    return row?.id ?? null;
  }
}
