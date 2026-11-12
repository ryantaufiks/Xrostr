import { z } from 'zod';
import type { ShiftAttendance } from './attendance.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

export const SHIFT_KINDS = ['day', 'night', 'custom'] as const;
export type ShiftKind = (typeof SHIFT_KINDS)[number];

export const SHIFT_STATUSES = ['draft', 'published', 'cancelled'] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

/** Standard 12-hour security shifts, in the site's local time. */
export const SHIFT_PRESETS: Record<
  Exclude<ShiftKind, 'custom'>,
  { start: string; hours: number }
> = {
  day: { start: '08:00', hours: 12 },
  night: { start: '20:00', hours: 12 },
};

/** The site's local date and start time; the server converts with the site's time zone. */
export const createShiftSchema = z.object({
  locationId: z.uuid(),
  employeeId: z.uuid(),
  date: isoDate,
  startTime: clock,
  durationHours: z.number().min(1).max(24),
  kind: z.enum(SHIFT_KINDS),
  notes: z.string().trim().max(500).optional(),
});
export type CreateShiftRequest = z.infer<typeof createShiftSchema>;

export const rosterQuerySchema = z
  .object({ locationId: z.uuid(), from: isoDate, to: isoDate })
  .refine((v) => v.from <= v.to, { path: ['to'], message: 'End must not be before start' });
export type RosterQuery = z.infer<typeof rosterQuerySchema>;

export const publishRosterSchema = rosterQuerySchema;
export type PublishRosterRequest = RosterQuery;

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
  location: { id: string; name: string };
  employee: { id: string; fullName: string; employeeNo: string };
  attendance: ShiftAttendance | null;
}

export interface PublishResult {
  published: number;
  notified: number;
}
