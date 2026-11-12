import { Injectable } from '@nestjs/common';
import { locationStaffing } from '@xrostr/db';
import { asc, eq } from 'drizzle-orm';
import { DatabaseContext } from '../../../shared/infrastructure/database/database-context.js';
import { StaffingRepository, type StaffingRow } from '../application/ports.js';

@Injectable()
export class DrizzleStaffingRepository extends StaffingRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async forLocation(locationId: string): Promise<StaffingRow[]> {
    const rows = await this.ctx
      .executor()
      .select({
        weekday: locationStaffing.weekday,
        dayCount: locationStaffing.dayCount,
        nightCount: locationStaffing.nightCount,
      })
      .from(locationStaffing)
      .where(eq(locationStaffing.locationId, locationId))
      .orderBy(asc(locationStaffing.weekday));
    return rows.map((r) => ({
      weekday: r.weekday,
      dayCount: r.dayCount,
      nightCount: r.nightCount,
    }));
  }

  async replace(locationId: string, rows: readonly StaffingRow[]): Promise<void> {
    const db = this.ctx.executor();
    await db.transaction(async (tx) => {
      await tx.delete(locationStaffing).where(eq(locationStaffing.locationId, locationId));
      if (rows.length === 0) return;
      await tx.insert(locationStaffing).values(
        rows.map((r) => ({
          tenantId: this.ctx.tenantId(),
          locationId,
          weekday: r.weekday,
          dayCount: r.dayCount,
          nightCount: r.nightCount,
        })),
      );
    });
  }
}
