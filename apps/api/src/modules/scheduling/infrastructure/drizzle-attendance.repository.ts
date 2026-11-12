import { Injectable } from '@nestjs/common';
import type { ShiftAttendance } from '@xrostr/contracts';
import { attendanceEvents } from '@xrostr/db';
import { inArray } from 'drizzle-orm';
import { DatabaseContext } from '../../../shared/infrastructure/database/database-context.js';
import { AttendanceRepository, type NewAttendanceEvent } from '../application/ports.js';
import { causeCode } from './drizzle-shift.repository.js';

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class DrizzleAttendanceRepository extends AttendanceRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async insert(event: NewAttendanceEvent): Promise<string | null> {
    try {
      // Savepoint: a duplicate must not abort the surrounding transaction.
      return await this.ctx.executor().transaction(async (tx) => {
        const [row] = await tx
          .insert(attendanceEvents)
          .values({ ...event, tenantId: this.ctx.tenantId() })
          .returning({ id: attendanceEvents.id });
        return row!.id;
      });
    } catch (error) {
      if (causeCode(error) === UNIQUE_VIOLATION) return null;
      throw error;
    }
  }

  async forShifts(shiftIds: readonly string[]): Promise<Map<string, ShiftAttendance>> {
    const result = new Map<string, ShiftAttendance>();
    if (shiftIds.length === 0) return result;
    const rows = await this.ctx
      .executor()
      .select()
      .from(attendanceEvents)
      .where(inArray(attendanceEvents.shiftId, [...shiftIds]));
    for (const row of rows) {
      const entry = result.get(row.shiftId) ?? {
        checkInAt: null,
        checkOutAt: null,
        lateMinutes: null,
      };
      if (row.kind === 'check_in') {
        entry.checkInAt = row.occurredAt.toISOString();
        entry.lateMinutes = row.lateMinutes;
      } else {
        entry.checkOutAt = row.occurredAt.toISOString();
      }
      result.set(row.shiftId, entry);
    }
    return result;
  }
}
