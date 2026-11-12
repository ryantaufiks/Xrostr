import { Injectable } from '@nestjs/common';
import type { ShiftKind, ShiftStatus } from '@xrostr/contracts';
import { shifts } from '@xrostr/db';
import { and, asc, eq, gt, gte, lt, ne } from 'drizzle-orm';
import { DatabaseContext } from '../../../shared/infrastructure/database/database-context.js';
import { ShiftRepository, type NewShift, type Shift } from '../application/ports.js';

type Row = typeof shifts.$inferSelect;

const toShift = (r: Row): Shift => ({
  id: r.id,
  locationId: r.locationId,
  employeeId: r.employeeId,
  kind: r.kind as ShiftKind,
  status: r.status as ShiftStatus,
  startsAt: r.startsAt,
  endsAt: r.endsAt,
  notes: r.notes,
});

/** Postgres error for an exclusion-constraint violation (shifts_no_overlap). */
const EXCLUSION_VIOLATION = '23P01';

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
      if (causeCode(error) === EXCLUSION_VIOLATION) return null;
      throw error;
    }
  }

  async findById(id: string): Promise<Shift | null> {
    const [row] = await this.ctx.executor().select().from(shifts).where(eq(shifts.id, id)).limit(1);
    return row ? toShift(row) : null;
  }

  async overlaps(employeeId: string, startsAt: Date, endsAt: Date): Promise<boolean> {
    const [row] = await this.ctx
      .executor()
      .select({ id: shifts.id })
      .from(shifts)
      .where(
        and(
          eq(shifts.employeeId, employeeId),
          ne(shifts.status, 'cancelled'),
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

  async publishDrafts(locationId: string, start: Date, end: Date, at: Date): Promise<Shift[]> {
    const rows = await this.ctx
      .executor()
      .update(shifts)
      .set({ status: 'published', publishedAt: at })
      .where(
        and(
          eq(shifts.locationId, locationId),
          eq(shifts.status, 'draft'),
          gte(shifts.startsAt, start),
          lt(shifts.startsAt, end),
        ),
      )
      .returning();
    return rows.map(toShift);
  }

  async remove(id: string): Promise<void> {
    await this.ctx.executor().delete(shifts).where(eq(shifts.id, id));
  }

  async cancel(id: string): Promise<void> {
    await this.ctx.executor().update(shifts).set({ status: 'cancelled' }).where(eq(shifts.id, id));
  }
}

function causeCode(error: unknown): string | undefined {
  for (let e: unknown = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    if ('code' in e && typeof e.code === 'string') return e.code;
  }
  return undefined;
}
