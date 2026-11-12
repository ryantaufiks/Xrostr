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
  /** Touches at one site closer together than this count as one visit. */
  visitGapMinutes: number;
  /** `minVisits`: visits a roving officer owes the site per shift; 0 means no target. */
  locations: { id: string; name: string; minVisits: number }[];
}

export const VISIT_GAP_CHOICES = [30, 60, 90, 120, 180] as const;
export const MAX_MIN_VISITS = 12;

export const updateZoneTargetsSchema = z.object({
  visitGapMinutes: z.number().int().min(15).max(480),
  targets: z
    .array(
      z.object({
        locationId: z.uuid(),
        minVisits: z.number().int().min(0).max(MAX_MIN_VISITS),
      }),
    )
    .min(1),
});
export type UpdateZoneTargetsRequest = z.infer<typeof updateZoneTargetsSchema>;

/**
 * How many visits a list of touches at one site makes: a touch counts when it comes at least
 * `gapMinutes` after the last counted one. Shared by the API and the worker.
 */
export function countVisits(times: readonly Date[], gapMinutes: number): number {
  const gap = gapMinutes * 60_000;
  let count = 0;
  let last = -Infinity;
  for (const t of [...times].map((d) => d.getTime()).sort((a, b) => a - b)) {
    if (t - last >= gap) {
      count++;
      last = t;
    }
  }
  return count;
}

/**
 * - `met`: target reached. `behind`: running, and the time left is too short for the visits
 *   still owed. `pending`: still owed, with time left. `missed`: the shift ended short.
 *   `unserved`: the officer was pulled away as a relief before the target was met.
 *   `none`: the site has no target.
 */
export const VISIT_STATES = ['met', 'pending', 'behind', 'missed', 'unserved', 'none'] as const;
export type VisitState = (typeof VISIT_STATES)[number];

export const rovingVisitsQuerySchema = z.object({ date: isoDate });
export type RovingVisitsQuery = z.infer<typeof rovingVisitsQuerySchema>;

export interface RovingShiftVisits {
  shiftId: string;
  employee: { id: string; fullName: string };
  zone: { id: string; name: string };
  timezone: string;
  localDate: string;
  localStart: string;
  localEnd: string;
  phase: 'upcoming' | 'running' | 'ended';
  checkedInAt: string | null;
  /** Set when the officer was pulled away as a relief: the zone is unserved from this time. */
  unservedSince: string | null;
  /** Where the officer went as a relief. */
  pulledTo: { id: string; name: string } | null;
  visitGapMinutes: number;
  sites: {
    location: { id: string; name: string };
    minVisits: number;
    visits: number;
    lastVisitAt: string | null;
    state: VisitState;
  }[];
}

// ---------- Relief (replacement) ----------

/** Why a candidate is offered first: already on duty nearby, on call, or off duty. */
export const RELIEF_PRIORITIES = ['roving', 'standby', 'off_duty'] as const;
export type ReliefPriority = (typeof RELIEF_PRIORITIES)[number];

export const RELIEF_STATUSES = ['open', 'filled', 'unfilled', 'cancelled'] as const;
export type ReliefStatus = (typeof RELIEF_STATUSES)[number];

export const RELIEF_OFFER_STATUSES = [
  'queued',
  'offered',
  'accepted',
  'declined',
  'expired',
  'withdrawn',
] as const;
export type ReliefOfferStatus = (typeof RELIEF_OFFER_STATUSES)[number];

export interface ReliefCandidate {
  employee: { id: string; fullName: string; employeeNo: string; phone: string | null };
  priority: ReliefPriority;
  /** Working hours already planned in the week of the shift. */
  weeklyHours: number;
  /** Taking this shift would push the officer over the weekly limit. */
  overWeeklyLimit: boolean;
}

/** Candidates in the order to offer, and how long each has to answer. */
export const sendReliefSchema = z.object({
  employeeIds: z.array(z.uuid()).min(1).max(20),
  timeoutMinutes: z.number().int().min(5).max(60).default(15),
});
export type SendReliefRequest = z.infer<typeof sendReliefSchema>;

export const reliefQuerySchema = z.object({
  locationId: z.uuid().optional(),
  status: z.enum(['open', 'all']).default('open'),
});
export type ReliefQuery = z.infer<typeof reliefQuerySchema>;

export interface ReliefRequestView {
  id: string;
  shiftId: string;
  status: ReliefStatus;
  location: { id: string; name: string };
  original: { id: string; fullName: string };
  localDate: string;
  localStart: string;
  localEnd: string;
  timezone: string;
  timeoutMinutes: number;
  offers: {
    employee: { id: string; fullName: string };
    status: ReliefOfferStatus;
    expiresAt: string | null;
  }[];
  filledBy: { id: string; fullName: string } | null;
  /** The relief's own shift once filled. */
  newShiftId: string | null;
  createdAt: string;
}

/** A replacement offer as the officer sees it. */
export interface MyReliefOffer {
  id: string;
  status: ReliefOfferStatus;
  expiresAt: string | null;
  location: { id: string; name: string };
  localDate: string;
  localStart: string;
  localEnd: string;
  timezone: string;
}

/**
 * Whether the time left in a running roving shift is too short for the visits still owed,
 * allowing one visit gap per visit. Shared by the visit view and the worker's warning.
 */
export function visitsAtRisk(owed: number, remainingMs: number, gapMinutes: number): boolean {
  return owed > 0 && remainingMs < owed * gapMinutes * 60_000;
}
