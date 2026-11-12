import type {
  AttendanceKind,
  ReliefOfferStatus,
  ReliefStatus,
  ShiftAttendance,
  ShiftKind,
  ShiftStatus,
} from '@xrostr/contracts';

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
export type NewShift = Omit<Shift, 'id' | 'status'> & {
  createdBy: string;
  /** Set on a relief shift: the shift it takes over from. */
  replacesShiftId?: string | null;
};

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
  /** Ends a shift early, e.g. when a relief takes over part way through. */
  abstract truncate(id: string, endsAt: Date): Promise<void>;
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
  /** Visits owed per roving shift; 0 means no target. */
  minVisits: number;
}

export interface Zone {
  id: string;
  name: string;
  visitGapMinutes: number;
  locations: ZoneLocation[];
}

/** All methods require a tenant unit of work. */
export abstract class ZoneRepository {
  abstract list(): Promise<Zone[]>;
  abstract findById(id: string): Promise<Zone | null>;
  /** Null when a zone with that name already exists. */
  abstract insert(name: string, locationIds: readonly string[]): Promise<string | null>;
  /** Sets the visit gap and each listed site's target; sites not in the zone are ignored. */
  abstract updateTargets(
    id: string,
    visitGapMinutes: number,
    targets: readonly { locationId: string; minVisits: number }[],
  ): Promise<void>;
}

export interface NewSiteVisit {
  shiftId: string;
  employeeId: string;
  locationId: string;
  occurredAt: Date;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  distanceM: number;
}

/** A roving shift with what the visit view needs about it. */
export interface RovingShift extends Shift {
  zoneId: string;
  /** Set when a relief pulled this officer away: where to. */
  pulledTo: { requestId: string; locationId: string } | null;
}

/** One touch at a site during a shift: check-in or -out, a visit scan, or a patrol scan. */
export interface SiteTouch {
  shiftId: string;
  locationId: string;
  at: Date;
}

/** All methods require a tenant unit of work. */
export abstract class VisitRepository {
  abstract insert(visit: NewSiteVisit): Promise<void>;
  /**
   * Roving shifts overlapping [start, end): published ones, plus cancelled ones that a relief
   * pulled away before they began (their zone went unserved).
   */
  abstract rovingShifts(start: Date, end: Date): Promise<RovingShift[]>;
  abstract touches(shiftIds: readonly string[]): Promise<SiteTouch[]>;
}

export interface ReliefRequest {
  id: string;
  shiftId: string;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
  requestedBy: string;
  status: ReliefStatus;
  timeoutMinutes: number;
  filledEmployeeId: string | null;
  newShiftId: string | null;
  createdAt: Date;
}

export interface ReliefOffer {
  id: string;
  requestId: string;
  employeeId: string;
  position: number;
  status: ReliefOfferStatus;
  offeredAt: Date | null;
  expiresAt: Date | null;
}

/** All methods require a tenant unit of work. */
export abstract class ReliefRepository {
  /** Null when the shift already has an open search. */
  abstract insertRequest(
    request: Pick<
      ReliefRequest,
      'shiftId' | 'locationId' | 'startsAt' | 'endsAt' | 'requestedBy' | 'timeoutMinutes'
    >,
  ): Promise<string | null>;
  abstract insertOffers(requestId: string, employeeIds: readonly string[]): Promise<void>;
  abstract findRequest(id: string): Promise<ReliefRequest | null>;
  /** Reads the request and locks it until the transaction ends, so two accepts cannot both win. */
  abstract lockRequest(id: string): Promise<ReliefRequest | null>;
  abstract list(filter: { locationId?: string; openOnly: boolean }): Promise<ReliefRequest[]>;
  abstract offers(requestIds: readonly string[]): Promise<ReliefOffer[]>;
  abstract findOffer(id: string): Promise<ReliefOffer | null>;
  /** Offers currently waiting for this employee's answer, on open requests. */
  abstract pendingFor(employeeId: string, at: Date): Promise<ReliefOffer[]>;
  abstract setOfferStatus(id: string, status: ReliefOfferStatus, at: Date): Promise<void>;
  /** Offers the next queued candidate; null when the queue is empty. */
  abstract offerNext(requestId: string, at: Date, expiresAt: Date): Promise<ReliefOffer | null>;
  /** Withdraws every offer still queued or offered. */
  abstract withdrawRemaining(requestId: string, at: Date): Promise<void>;
  abstract close(
    id: string,
    status: Exclude<ReliefStatus, 'open'>,
    at: Date,
    filled?: { employeeId: string; shiftId: string; pulledShiftId?: string | null },
  ): Promise<void>;
}
