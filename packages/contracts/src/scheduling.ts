import { z } from 'zod';
import type { ShiftAttendance } from './attendance.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

export const SHIFT_KINDS = ['day', 'night', 'custom', 'standby'] as const;
export type ShiftKind = (typeof SHIFT_KINDS)[number];

export const ASSIGNMENT_TYPES = ['fixed', 'roving'] as const;
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

export const SHIFT_STATUSES = ['draft', 'published', 'cancelled'] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

/** Standard 12-hour security shifts, in the site's local time. */
export const SHIFT_PRESETS: Record<
  Exclude<ShiftKind, 'custom' | 'standby'>,
  { start: string; hours: number }
> = {
  day: { start: '08:00', hours: 12 },
  night: { start: '20:00', hours: 12 },
};

const shiftFields = z.object({
  /** The site for a fixed shift; null for roving (zone) and standby shifts. */
  locationId: z.uuid().nullable().optional(),
  /** The zone for a roving shift; null for fixed and standby shifts. */
  zoneId: z.uuid().nullable().optional(),
  employeeId: z.uuid(),
  date: isoDate,
  startTime: clock,
  durationHours: z.number().min(1).max(24),
  kind: z.enum(SHIFT_KINDS),
  notes: z.string().trim().max(500).optional(),
});
const hasOnePlace = (v: { kind: ShiftKind; locationId?: string | null; zoneId?: string | null }) =>
  v.kind === 'standby' || (v.locationId != null) !== (v.zoneId != null);
const onePlaceMessage = {
  path: ['zoneId'],
  message: 'Site or zone shifts need exactly one of locationId and zoneId',
};

/** The site's local date and start time; the server converts with the site's time zone. */
export const createShiftSchema = shiftFields.refine(hasOnePlace, onePlaceMessage);
export type CreateShiftRequest = z.infer<typeof createShiftSchema>;

/**
 * Several shifts in one go, all or nothing. `replaceShiftId` names a draft of the same officer
 * that the new shift takes the place of, so a grid cell can be changed in one step.
 */
export const batchShiftsSchema = z.object({
  items: z
    .array(
      shiftFields
        .extend({ replaceShiftId: z.uuid().optional() })
        .refine(hasOnePlace, onePlaceMessage),
    )
    .min(1)
    .max(100),
});
export type BatchShiftsRequest = z.infer<typeof batchShiftsSchema>;

export const rosterQuerySchema = z
  .object({ locationId: z.uuid(), from: isoDate, to: isoDate })
  .refine((v) => v.from <= v.to, { path: ['to'], message: 'End must not be before start' });
export type RosterQuery = z.infer<typeof rosterQuerySchema>;

export const publishRosterSchema = rosterQuerySchema;
export type PublishRosterRequest = RosterQuery;

export const copyRosterSchema = rosterQuerySchema;
export type CopyRosterRequest = RosterQuery;

export interface CopyResult {
  copied: number;
  skipped: number;
}

export const myShiftsQuerySchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((v) => v.from <= v.to, { path: ['to'], message: 'End must not be before start' });
export type MyShiftsQuery = z.infer<typeof myShiftsQuerySchema>;

export interface ShiftView {
  id: string;
  kind: ShiftKind;
  status: ShiftStatus;
  /** UTC instants. */
  startsAt: string;
  endsAt: string;
  /** Site-local date and clock times, ready to display. */
  localDate: string;
  localStart: string;
  localEnd: string;
  timezone: string;
  notes: string | null;
  location: { id: string; name: string } | null;
  zone: { id: string; name: string } | null;
  employee: { id: string; fullName: string; employeeNo: string };
  attendance: ShiftAttendance | null;
}

export interface PublishResult {
  published: number;
  notified: number;
}

/** Staffing target for one weekday. `weekday` is ISO: 1 = Monday … 7 = Sunday. */
export interface StaffingRequirement {
  weekday: number;
  dayCount: number;
  nightCount: number;
}

/** One entry per day of the week, Monday (1) through Sunday (7). */
export const setStaffingSchema = z.object({
  requirements: z
    .array(
      z.object({
        weekday: z.number().int().min(1).max(7),
        dayCount: z.number().int().min(0).max(99),
        nightCount: z.number().int().min(0).max(99),
      }),
    )
    .length(7),
});
export type SetStaffingRequest = z.infer<typeof setStaffingSchema>;

export interface StaffingView {
  locationId: string;
  requirements: StaffingRequirement[];
}

export const CONFLICT_KINDS = [
  'leave',
  'rest',
  'weekly_hours',
  'consecutive_nights',
  'site_not_allowed',
] as const;
export type ConflictKind = (typeof CONFLICT_KINDS)[number];

/** Statutory weekly working-hour limits by country code. */
export const WEEKLY_HOUR_LIMITS: Record<string, number> = { ID: 40, SG: 44 };

export interface ShiftConflict {
  kind: ConflictKind;
  employeeId: string;
  employeeName: string;
  /** The shift the conflict concerns; null for an employee-wide weekly-hours excess. */
  shiftId: string | null;
  /** The site-local date the conflict concerns, for highlighting. */
  localDate: string;
  /** Contextual number: rest-gap hours, total weekly hours, or the consecutive-night run. */
  detail: number;
}

export interface LeaveSpan {
  employeeId: string;
  startDate: string;
  endDate: string;
}

export interface RosterConflictsView {
  conflicts: ShiftConflict[];
  leaves: LeaveSpan[];
}

export interface RosterAuxiliaryView {
  /** Roving shifts for zones that contain the site. */
  roving: ShiftView[];
  /** Standby (on-call at home) shifts of the site's officers. */
  standby: ShiftView[];
}

export const createZoneSchema = z.object({
  name: z.string().trim().min(2).max(100),
  locationIds: z.array(z.uuid()).min(1),
});
export type CreateZoneRequest = z.infer<typeof createZoneSchema>;

export interface ZoneView {
  id: string;
  name: string;
  locations: { id: string; name: string }[];
}
