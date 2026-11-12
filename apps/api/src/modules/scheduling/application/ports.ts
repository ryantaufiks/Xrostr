import type { AttendanceKind, ShiftAttendance, ShiftKind, ShiftStatus } from '@xrostr/contracts';

export interface Shift {
  id: string;
  locationId: string | null;
  zoneId: string | null;
  employeeId: string;
  kind: ShiftKind;
  status: ShiftStatus;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  notes: string | null;
}
export type NewShift = Omit<Shift, 'id' | 'status'> & { createdBy: string };

/** All methods require a tenant unit of work. */
export abstract class ShiftRepository {
  /** Returns null when the database refuses an overlap that slipped past the check. */
  abstract insert(shift: NewShift): Promise<string | null>;
  abstract findById(id: string): Promise<Shift | null>;
  /**
   * Whether the time clashes with another live shift of the same family: working shifts clash
   * with working shifts, standby with standby. An officer on standby can be called in to work.
   */
  abstract overlaps(
    employeeId: string,
    startsAt: Date,
    endsAt: Date,
    standby: boolean,
  ): Promise<boolean>;
  /** Shifts at a site starting within [start, end), cancelled ones excluded. */
  abstract forLocation(locationId: string, start: Date, end: Date): Promise<Shift[]>;
  /** Published shifts of one employee starting within [start, end). */
  abstract publishedForEmployee(employeeId: string, start: Date, end: Date): Promise<Shift[]>;
  /** Non-cancelled shifts of several employees starting within [start, end). */
  abstract forEmployees(employeeIds: readonly string[], start: Date, end: Date): Promise<Shift[]>;
  /** Publishes the given draft shifts; returns those that changed. */
  abstract publishByIds(ids: readonly string[], at: Date): Promise<Shift[]>;
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

export interface StaffingRow {
  weekday: number;
  dayCount: number;
  nightCount: number;
}

/** All methods require a tenant unit of work. */
export abstract class StaffingRepository {
  /** Staffing targets for one site, in weekday order. */
  abstract forLocation(locationId: string): Promise<StaffingRow[]>;
  /** Replaces the site's whole week of targets with the given rows. */
  abstract replace(locationId: string, rows: readonly StaffingRow[]): Promise<void>;
}

export interface LeaveSpan {
  employeeId: string;
  startDate: string;
  endDate: string;
}

/** Read-only view of approved leave for roster planning. */
export abstract class LeaveCalendarRepository {
  abstract approvedSpans(
    employeeIds: readonly string[],
    from: string,
    to: string,
  ): Promise<LeaveSpan[]>;
}

export interface ZoneLocation {
  id: string;
  name: string;
  timezone: string;
}

export interface Zone {
  id: string;
  name: string;
  locations: ZoneLocation[];
}

/** All methods require a tenant unit of work. */
export abstract class ZoneRepository {
  abstract list(): Promise<Zone[]>;
  abstract findById(id: string): Promise<Zone | null>;
  /** Null when a zone with that name already exists. */
  abstract insert(name: string, locationIds: readonly string[]): Promise<string | null>;
}
