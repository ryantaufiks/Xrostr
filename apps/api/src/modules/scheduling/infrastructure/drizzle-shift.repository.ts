import { Injectable } from '@nestjs/common';
import type { ShiftKind, ShiftStatus } from '@xrostr/contracts';
import { shifts, zoneLocations } from '@xrostr/db';
import { and, asc, eq, gt, gte, inArray, lt, lte, ne, or } from 'drizzle-orm';
import { DatabaseContext } from '../../../shared/infrastructure/database/database-context.js';
import {
  causeCode,
  PG_EXCLUSION_VIOLATION,
} from '../../../shared/infrastructure/database/pg-errors.js';
import { ShiftRepository, type NewShift, type Shift } from '../application/ports.js';

type Row = typeof shifts.$inferSelect;

const toShift = (r: Row): Shift => ({
  id: r.id,
  locationId: r.locationId,
  zoneId: r.zoneId,
  employeeId: r.employeeId,
  kind: r.kind as ShiftKind,
  status: r.status as ShiftStatus,
  startsAt: r.startsAt,
  endsAt: r.endsAt,
  timezone: r.timezone,
  notes: r.notes,
});

/** Postgres error for an exclusion-constraint violation (shifts_no_overlap). */

@Injectable()
export class DrizzleShiftRepository extends ShiftRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async insert(shift: NewShift): Promise<string | null> {
    const db = this.ctx.executor();
    try {
      // A savepoint keeps the surrounding transaction usable if the constraint fires.
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(shifts)
          .values({ ...shift, tenantId: this.ctx.tenantId() })
          .returning({ id: shifts.id });
        return row!.id;
      });
    } catch (error) {
      if (causeCode(error) === PG_EXCLUSION_VIOLATION) return null;
      throw error;
    }
  }

  async findById(id: string): Promise<Shift | null> {
    const [row] = await this.ctx.executor().select().from(shifts).where(eq(shifts.id, id)).limit(1);
    return row ? toShift(row) : null;
  }

  async overlaps(
    employeeId: string,
    startsAt: Date,
    endsAt: Date,
    standby: boolean,
  ): Promise<boolean> {
    const [row] = await this.ctx
      .executor()
      .select({ id: shifts.id })
      .from(shifts)
      .where(
        and(
          eq(shifts.employeeId, employeeId),
          ne(shifts.status, 'cancelled'),
          standby ? eq(shifts.kind, 'standby') : ne(shifts.kind, 'standby'),
          lt(shifts.startsAt, endsAt),
          gt(shifts.endsAt, startsAt),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async forLocation(locationId: string, start: Date, end: Date): Promise<Shift[]> {
    const rows = await this.ctx
      .executor()
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.locationId, locationId),
          ne(shifts.status, 'cancelled'),
          gte(shifts.startsAt, start),
          lt(shifts.startsAt, end),
        ),
      )
      .orderBy(asc(shifts.startsAt));
    return rows.map(toShift);
  }

  async publishedForEmployee(employeeId: string, start: Date, end: Date): Promise<Shift[]> {
    const rows = await this.ctx
      .executor()
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.employeeId, employeeId),
          eq(shifts.status, 'published'),
          gte(shifts.startsAt, start),
          lt(shifts.startsAt, end),
        ),
      )
      .orderBy(asc(shifts.startsAt));
    return rows.map(toShift);
  }

  async forEmployees(employeeIds: readonly string[], start: Date, end: Date): Promise<Shift[]> {
    if (employeeIds.length === 0) return [];
    const rows = await this.ctx
      .executor()
      .select()
      .from(shifts)
      .where(
        and(
          inArray(shifts.employeeId, [...employeeIds]),
          ne(shifts.status, 'cancelled'),
          gte(shifts.startsAt, start),
          lt(shifts.startsAt, end),
        ),
      )
      .orderBy(asc(shifts.startsAt));
    return rows.map(toShift);
  }

  async publishByIds(ids: readonly string[], at: Date): Promise<Shift[]> {
    if (ids.length === 0) return [];
    const rows = await this.ctx
      .executor()
      .update(shifts)
      .set({ status: 'published', publishedAt: at })
      .where(and(inArray(shifts.id, [...ids]), eq(shifts.status, 'draft')))
      .returning();
    return rows.map(toShift);
  }

  async attendanceCandidates(
    employeeId: string,
    locationId: string,
    at: Date,
    opensBeforeMs: number,
    closesAfterMs: number,
  ): Promise<Shift[]> {
    const rows = await this.ctx
      .executor()
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.employeeId, employeeId),
          // The site's own shifts, or roving shifts of a zone that contains the site.
          or(
            eq(shifts.locationId, locationId),
            inArray(
              shifts.zoneId,
              this.ctx
                .executor()
                .select({ id: zoneLocations.zoneId })
                .from(zoneLocations)
                .where(eq(zoneLocations.locationId, locationId)),
            ),
          ),
          // On-call at home is never checked in.
          ne(shifts.kind, 'standby'),
          eq(shifts.status, 'published'),
          lte(shifts.startsAt, new Date(at.getTime() + opensBeforeMs)),
          gt(shifts.endsAt, new Date(at.getTime() - closesAfterMs)),
        ),
      )
      .orderBy(asc(shifts.startsAt));
    return rows.map(toShift);
  }

  async liveForEmployee(employeeId: string, start: Date, end: Date): Promise<Shift[]> {
    const rows = await this.ctx
      .executor()
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.employeeId, employeeId),
          ne(shifts.status, 'cancelled'),
          gte(shifts.startsAt, start),
          lt(shifts.startsAt, end),
        ),
      )
      .orderBy(asc(shifts.startsAt));
    return rows.map(toShift);
  }

  async remove(id: string): Promise<void> {
    await this.ctx.executor().delete(shifts).where(eq(shifts.id, id));
  }

  async cancel(id: string): Promise<void> {
    await this.ctx.executor().update(shifts).set({ status: 'cancelled' }).where(eq(shifts.id, id));
  }

  async truncate(id: string, endsAt: Date): Promise<void> {
    await this.ctx.executor().update(shifts).set({ endsAt }).where(eq(shifts.id, id));
  }
}
