import { z } from 'zod';

export const ATTENDANCE_KINDS = ['check_in', 'check_out'] as const;
export type AttendanceKind = (typeof ATTENDANCE_KINDS)[number];

/** Sent by the officer's phone after scanning the site QR code. */
export const recordAttendanceSchema = z.object({
  locationId: z.uuid(),
  code: z.string().min(16).max(128),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** Reported GPS accuracy in metres. */
  accuracy: z.number().min(0).max(10_000).optional(),
  /**
   * On a roving shift a scan during the shift records a visit; send `check_out` to end the
   * shift instead. Ignored for site shifts, where the second scan always checks out.
   */
  action: z.enum(['check_out']).optional(),
});
export type RecordAttendanceRequest = z.infer<typeof recordAttendanceSchema>;

export interface AttendanceResult {
  /** `visit`: a roving officer's scan at a site of their zone during the shift. */
  kind: AttendanceKind | 'visit';
  /** For a roving shift: whether the officer could end the shift with this scan instead. */
  roving?: boolean;
  occurredAt: string;
  /** Minutes after the shift start; 0 when on time. Check-ins only. */
  lateMinutes: number | null;
  distanceM: number;
  shift: {
    id: string;
    localDate: string;
    localStart: string;
    localEnd: string;
    locationName: string;
    /** The site's zone: times are shown in it, not in the phone's. */
    timezone: string;
  };
}

/** Attendance of one shift, shown on rosters and on "my shifts". */
export interface ShiftAttendance {
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number | null;
}

export interface CheckinCode {
  /** Content of the QR code: a link that opens the check-in page. */
  path: string;
}
