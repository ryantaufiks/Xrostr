import { Injectable } from '@nestjs/common';
import { locations, zoneLocations, zones } from '@xrostr/db';
import { and, asc, eq } from 'drizzle-orm';
import { DatabaseContext } from '../../../shared/infrastructure/database/database-context.js';
import {
  causeCode,
  PG_UNIQUE_VIOLATION,
} from '../../../shared/infrastructure/database/pg-errors.js';
import { ZoneRepository, type Zone } from '../application/ports.js';

@Injectable()
export class DrizzleZoneRepository extends ZoneRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async list(): Promise<Zone[]> {
    const zoneRows = await this.ctx.executor().select().from(zones).orderBy(asc(zones.name));
    if (zoneRows.length === 0) return [];
    const members = await this.ctx
      .executor()
      .select({
        zoneId: zoneLocations.zoneId,
        id: locations.id,
        name: locations.name,
        timezone: locations.timezone,
        minVisits: zoneLocations.minVisits,
      })
      .from(zoneLocations)
      .innerJoin(locations, eq(zoneLocations.locationId, locations.id))
      .orderBy(asc(locations.name));
    const byZone = Map.groupBy(members, (m) => m.zoneId);
    return zoneRows.map((z) => ({
      id: z.id,
      name: z.name,
      visitGapMinutes: z.visitGapMinutes,
      locations: (byZone.get(z.id) ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        timezone: l.timezone,
        minVisits: l.minVisits,
      })),
    }));
  }

  async findById(id: string): Promise<Zone | null> {
    const [row] = await this.ctx.executor().select().from(zones).where(eq(zones.id, id)).limit(1);
    if (!row) return null;
    const members = await this.ctx
      .executor()
      .select({
        id: locations.id,
        name: locations.name,
        timezone: locations.timezone,
        minVisits: zoneLocations.minVisits,
      })
      .from(zoneLocations)
      .innerJoin(locations, eq(zoneLocations.locationId, locations.id))
      .where(eq(zoneLocations.zoneId, id))
      .orderBy(asc(locations.name));
    return { id: row.id, name: row.name, visitGapMinutes: row.visitGapMinutes, locations: members };
  }

  async insert(name: string, locationIds: readonly string[]): Promise<string | null> {
    const [existing] = await this.ctx
      .executor()
      .select({ id: zones.id })
      .from(zones)
      .where(eq(zones.name, name))
      .limit(1);
    if (existing) return null;
    try {
      return await this.insertWithSites(name, locationIds);
    } catch (error) {
      // Two planners creating the same name at once: the unique constraint decides.
      if (causeCode(error) === PG_UNIQUE_VIOLATION) return null;
      throw error;
    }
  }

  private insertWithSites(name: string, locationIds: readonly string[]): Promise<string> {
    return this.ctx.executor().transaction(async (tx) => {
      const [row] = await tx
        .insert(zones)
        .values({ name, tenantId: this.ctx.tenantId() })
        .returning({ id: zones.id });
      const id = row!.id;
      if (locationIds.length > 0) {
        await tx.insert(zoneLocations).values(
          locationIds.map((locationId) => ({
            tenantId: this.ctx.tenantId(),
            zoneId: id,
            locationId,
          })),
        );
      }
      return id;
    });
  }

  async updateTargets(
    id: string,
    visitGapMinutes: number,
    targets: readonly { locationId: string; minVisits: number }[],
  ): Promise<void> {
    const db = this.ctx.executor();
    await db.update(zones).set({ visitGapMinutes, updatedAt: new Date() }).where(eq(zones.id, id));
    for (const t of targets) {
      await db
        .update(zoneLocations)
        .set({ minVisits: t.minVisits })
        .where(and(eq(zoneLocations.zoneId, id), eq(zoneLocations.locationId, t.locationId)));
    }
  }
}
