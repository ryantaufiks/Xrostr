import { z } from 'zod';
import { COUNTRY_CODES, type CountryCode } from './country.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

/** Longest single request; longer absences are split by HR. */
export const MAX_LEAVE_SPAN_DAYS = 120;

export const requestLeaveSchema = z
  .object({
    leaveType: z.string().min(1).max(40),
    startDate: isoDate,
    endDate: isoDate,
    reason: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.startDate <= v.endDate, {
    path: ['endDate'],
    message: 'End must not be before start',
  });
export type RequestLeaveRequest = z.infer<typeof requestLeaveSchema>;

export const decideLeaveSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(500).optional(),
});
export type DecideLeaveRequest = z.infer<typeof decideLeaveSchema>;

export const myLeaveQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
export type MyLeaveQuery = z.infer<typeof myLeaveQuerySchema>;

export const leaveQueueQuerySchema = z.object({
  status: z.enum(LEAVE_STATUSES).default('pending'),
});
export type LeaveQueueQuery = z.infer<typeof leaveQueueQuerySchema>;

export interface LeaveBalance {
  code: string;
  name: string;
  paid: boolean;
  requiresDocument: boolean;
  basis: string;
  /** Days for the year; null when the law sets no fixed quota. */
  entitlement: number | null;
  used: number;
  pending: number;
  remaining: number | null;
  /** False until the employee has served long enough to use this type. */
  eligible: boolean;
}

export interface LeaveRequestView {
  id: string;
  leaveType: { code: string; name: string };
  startDate: string;
  endDate: string;
  /** Leave days charged: calendar days minus public holidays. */
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  employee: { id: string; fullName: string; employeeNo: string };
  /** Shifts of the employee inside the leave; approval cancels them. Shown to approvers. */
  conflictingShifts: number;
}

export interface MyLeave {
  year: number;
  /** Country whose leave law and holidays apply to the employee. */
  countryCode: CountryCode;
  balances: LeaveBalance[];
  requests: LeaveRequestView[];
}

export const holidayQuerySchema = z.object({
  countryCode: z.enum(COUNTRY_CODES),
  year: z.coerce.number().int().min(2000).max(2100),
});
export type HolidayQuery = z.infer<typeof holidayQuerySchema>;

export const createHolidaySchema = z.object({
  countryCode: z.enum(COUNTRY_CODES),
  date: isoDate,
  name: z.string().trim().min(2).max(120),
});
export type CreateHolidayRequest = z.infer<typeof createHolidaySchema>;

export interface HolidayView {
  id: string;
  countryCode: string;
  date: string;
  name: string;
}
