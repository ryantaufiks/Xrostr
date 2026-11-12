import type { HolidayDefault, LeaveStatus } from '@xrostr/contracts';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
}

export type NewLeaveRequest = Pick<
  LeaveRequest,
  'employeeId' | 'leaveType' | 'startDate' | 'endDate' | 'days' | 'reason'
>;

/** All methods require a tenant unit of work. */
export abstract class LeaveRequestRepository {
  abstract insert(request: NewLeaveRequest): Promise<string>;
  abstract findById(id: string): Promise<LeaveRequest | null>;
  /** Requests of an employee starting in the calendar year, any status. */
  abstract forEmployeeInYear(employeeId: string, year: number): Promise<LeaveRequest[]>;
  /** Pending or approved requests of an employee that share a day with start..end. */
  abstract overlapping(employeeId: string, start: string, end: string): Promise<LeaveRequest[]>;
  abstract withStatus(status: LeaveStatus): Promise<LeaveRequest[]>;
  abstract decide(
    id: string,
    status: LeaveStatus,
    decidedBy: string,
    at: Date,
    note: string | null,
  ): Promise<void>;
}

export interface Holiday {
  id: string;
  countryCode: string;
  date: string;
  name: string;
}

/** All methods require a tenant unit of work. */
export abstract class HolidayRepository {
  abstract isSeeded(countryCode: string, year: number): Promise<boolean>;
  /** Copies the defaults and records the year as seeded, in one go. */
  abstract seed(
    countryCode: string,
    year: number,
    defaults: readonly HolidayDefault[],
  ): Promise<void>;
  abstract between(countryCode: string, from: string, to: string): Promise<Holiday[]>;
  /** Null when that date already has a holiday. */
  abstract insert(countryCode: string, date: string, name: string): Promise<string | null>;
  abstract findById(id: string): Promise<Holiday | null>;
  abstract remove(id: string): Promise<void>;
}
