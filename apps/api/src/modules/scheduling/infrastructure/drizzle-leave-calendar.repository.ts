import { Injectable } from '@nestjs/common';
import { leaveRequests } from '@xrostr/db';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { DatabaseContext } from '../../../shared/infrastructure/database/database-context.js';
import { LeaveCalendarRepository, type LeaveSpan } from '../application/ports.js';

/**
 * Read-only view of approved leave for the roster. Reads the leave table directly so the
 * scheduling module does not have to depend on (and form a cycle with) the leave module.
 */
@Injectable()
export class DrizzleLeaveCalendarRepository extends LeaveCalendarRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async approvedSpans(
    employeeIds: readonly string[],
    from: string,
    to: string,
  ): Promise<LeaveSpan[]> {
    if (employeeIds.length === 0) return [];
    const rows = await this.ctx
      .executor()
      .select({
        employeeId: leaveRequests.employeeId,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
      })
      .from(leaveRequests)
      .where(
        and(
          inArray(leaveRequests.employeeId, [...employeeIds]),
          eq(leaveRequests.status, 'approved'),
          lte(leaveRequests.startDate, to),
          gte(leaveRequests.endDate, from),
        ),
      );
    return rows.map((r) => ({
      employeeId: r.employeeId,
      startDate: r.startDate,
      endDate: r.endDate,
    }));
  }
}
