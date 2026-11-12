import { Injectable } from '@nestjs/common';
import type { HolidayDefault, LeaveStatus } from '@xrostr/contracts';
import { holidayCalendars, leaveRequests, publicHolidays } from '@xrostr/db';
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { DatabaseContext } from '../../../shared/infrastructure/database/database-context.js';
import {
  HolidayRepository,
  LeaveRequestRepository,
  type Holiday,
  type LeaveRequest,
  type NewLeaveRequest,
} from '../application/ports.js';

type RequestRow = typeof leaveRequests.$inferSelect;

const toRequest = (r: RequestRow): LeaveRequest => ({
  id: r.id,
  employeeId: r.employeeId,
  leaveType: r.leaveType,
  startDate: r.startDate,
  endDate: r.endDate,
  days: r.days,
  reason: r.reason,
  status: r.status as LeaveStatus,
  decidedAt: r.decidedAt,
  decisionNote: r.decisionNote,
  createdAt: r.createdAt,
});

const LIVE: LeaveStatus[] = ['pending', 'approved'];

@Injectable()
export class DrizzleLeaveRequestRepository extends LeaveRequestRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async insert(request: NewLeaveRequest): Promise<string> {
    const [row] = await this.ctx
      .executor()
      .insert(leaveRequests)
      .values({ ...request, tenantId: this.ctx.tenantId() })
      .returning({ id: leaveRequests.id });
    return row!.id;
  }

  async findById(id: string): Promise<LeaveRequest | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.id, id))
      .limit(1);
    return row ? toRequest(row) : null;
  }

  async forEmployeeInYear(employeeId: string, year: number): Promise<LeaveRequest[]> {
    const rows = await this.ctx
      .executor()
      .select()
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.employeeId, employeeId),
          gte(leaveRequests.startDate, `${year}-01-01`),
          lte(leaveRequests.startDate, `${year}-12-31`),
        ),
      )
      .orderBy(desc(leaveRequests.startDate));
    return rows.map(toRequest);
  }

  async overlapping(employeeId: string, start: string, end: string): Promise<LeaveRequest[]> {
    const rows = await this.ctx
      .executor()
      .select()
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.employeeId, employeeId),
          inArray(leaveRequests.status, LIVE),
          lte(leaveRequests.startDate, end),
          gte(leaveRequests.endDate, start),
        ),
      );
    return rows.map(toRequest);
  }

  async withStatus(status: LeaveStatus): Promise<LeaveRequest[]> {
    const rows = await this.ctx
      .executor()
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.status, status))
      .orderBy(asc(leaveRequests.startDate))
      .limit(200);
    return rows.map(toRequest);
  }

  async decide(
    id: string,
    status: LeaveStatus,
    decidedBy: string,
    at: Date,
    note: string | null,
  ): Promise<void> {
    await this.ctx
      .executor()
      .update(leaveRequests)
      .set({ status, decidedBy, decidedAt: at, decisionNote: note })
      .where(eq(leaveRequests.id, id));
  }
}

@Injectable()
export class DrizzleHolidayRepository extends HolidayRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async isSeeded(countryCode: string, year: number): Promise<boolean> {
    const [row] = await this.ctx
      .executor()
      .select({ year: holidayCalendars.year })
      .from(holidayCalendars)
      .where(and(eq(holidayCalendars.countryCode, countryCode), eq(holidayCalendars.year, year)))
      .limit(1);
    return row !== undefined;
  }

  async seed(
    countryCode: string,
    year: number,
    defaults: readonly HolidayDefault[],
  ): Promise<void> {
    const db = this.ctx.executor();
    const tenantId = this.ctx.tenantId();
    // Two requests seeding the same year at once: the first wins, the second inserts nothing.
    const claimed = await db
      .insert(holidayCalendars)
      .values({ tenantId, countryCode, year })
      .onConflictDoNothing()
      .returning({ year: holidayCalendars.year });
    if (claimed.length === 0 || defaults.length === 0) return;
    await db
      .insert(publicHolidays)
      .values(defaults.map((h) => ({ tenantId, countryCode, date: h.date, name: h.name })))
      .onConflictDoNothing();
  }

  async between(countryCode: string, from: string, to: string): Promise<Holiday[]> {
    const rows = await this.ctx
      .executor()
      .select()
      .from(publicHolidays)
      .where(
        and(
          eq(publicHolidays.countryCode, countryCode),
          gte(publicHolidays.date, from),
          lte(publicHolidays.date, to),
        ),
      )
      .orderBy(asc(publicHolidays.date));
    return rows.map((r) => ({ id: r.id, countryCode: r.countryCode, date: r.date, name: r.name }));
  }

  async insert(countryCode: string, date: string, name: string): Promise<string | null> {
    const [row] = await this.ctx
      .executor()
      .insert(publicHolidays)
      .values({ tenantId: this.ctx.tenantId(), countryCode, date, name })
      .onConflictDoNothing()
      .returning({ id: publicHolidays.id });
    return row?.id ?? null;
  }

  async findById(id: string): Promise<Holiday | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(publicHolidays)
      .where(eq(publicHolidays.id, id))
      .limit(1);
    return row
      ? { id: row.id, countryCode: row.countryCode, date: row.date, name: row.name }
      : null;
  }

  async remove(id: string): Promise<void> {
    await this.ctx.executor().delete(publicHolidays).where(eq(publicHolidays.id, id));
  }
}
