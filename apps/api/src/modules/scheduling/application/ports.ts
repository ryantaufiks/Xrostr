import type { ShiftKind, ShiftStatus } from '@xrostr/contracts';

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
  abstract remove(id: string): Promise<void>;
  abstract cancel(id: string): Promise<void>;
}
