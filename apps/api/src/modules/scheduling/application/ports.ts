import type { AttendanceKind, ShiftAttendance, ShiftKind, ShiftStatus } from '@xrostr/contracts';

export interface Shift {
  id: string;
  locationId: string;
  employeeId: string;
  kind: ShiftKind;
  status: ShiftStatus;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
}

export type NewShift = Omit<Shift, 'id' | 'status'> & { createdBy: string };

/** All methods require a tenant unit of work. */
export abstract class ShiftRepository {
  /** Returns null when the database refuses an overlap that slipped past the check. */
  abstract insert(shift: NewShift): Promise<string | null>;
  abstract findById(id: string): Promise<Shift | null>;
  abstract overlaps(employeeId: string, startsAt: Date, endsAt: Date): Promise<boolean>;
  /** Shifts at a site starting within [start, end), cancelled ones excluded. */
  abstract forLocation(locationId: string, start: Date, end: Date): Promise<Shift[]>;
  /** Published shifts of one employee starting within [start, end). */
  abstract publishedForEmployee(employeeId: string, start: Date, end: Date): Promise<Shift[]>;
  /** Publishes the site's drafts starting within [start, end); returns what changed. */
  abstract publishDrafts(locationId: string, start: Date, end: Date, at: Date): Promise<Shift[]>;
  /** The employee's published shifts at a site whose attendance window contains `at`. */
  abstract attendanceCandidates(
    employeeId: string,
    locationId: string,
    at: Date,
    opensBeforeMs: number,
    closesAfterMs: number,
  ): Promise<Shift[]>;
  /** Live (not cancelled) shifts of an employee starting within [start, end). */
  abstract liveForEmployee(employeeId: string, start: Date, end: Date): Promise<Shift[]>;
  abstract remove(id: string): Promise<void>;
  abstract cancel(id: string): Promise<void>;
}

export interface NewAttendanceEvent {
  employeeId: string;
  shiftId: string;
  locationId: string;
  kind: AttendanceKind;
  occurredAt: Date;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  distanceM: number;
  lateMinutes: number | null;
}

/** All methods require a tenant unit of work. */
export abstract class AttendanceRepository {
  /** Null when this shift already has an event of that kind (a double tap or a race). */
  abstract insert(event: NewAttendanceEvent): Promise<string | null>;
  abstract forShifts(shiftIds: readonly string[]): Promise<Map<string, ShiftAttendance>>;
}
