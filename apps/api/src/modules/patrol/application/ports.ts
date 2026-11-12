import type { PatrolRoundStatus, PatrolStatus } from '@xrostr/contracts';

export interface PatrolRoute {
  id: string;
  locationId: string;
  name: string;
  intervalMinutes: number | null;
  status: PatrolStatus;
}

export interface PatrolCheckpoint {
  id: string;
  routeId: string;
  name: string;
  position: number;
  /** Printed in the QR code or written to the NFC sticker. Never sent with a route view. */
  tagSecret: string;
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  status: PatrolStatus;
}

export type NewCheckpoint = Pick<
  PatrolCheckpoint,
  'routeId' | 'name' | 'position' | 'latitude' | 'longitude' | 'radiusM'
>;
export type CheckpointChanges = Partial<
  Pick<PatrolCheckpoint, 'name' | 'latitude' | 'longitude' | 'radiusM' | 'status'>
>;

/** All methods require a tenant unit of work. */
export abstract class PatrolRouteRepository {
  abstract forLocation(locationId: string): Promise<PatrolRoute[]>;
  abstract findById(id: string): Promise<PatrolRoute | null>;
  /** Null when the site already has a route with that name. */
  abstract insert(route: Omit<PatrolRoute, 'id' | 'status'>): Promise<string | null>;
  /** False when the new name is taken at the site. */
  abstract update(
    id: string,
    changes: Partial<Pick<PatrolRoute, 'name' | 'intervalMinutes' | 'status'>>,
  ): Promise<boolean>;
  /** Checkpoints of the routes, in walking order. */
  abstract checkpoints(routeIds: readonly string[]): Promise<PatrolCheckpoint[]>;
  abstract findCheckpoint(id: string): Promise<PatrolCheckpoint | null>;
  abstract checkpointByTag(tagSecret: string): Promise<PatrolCheckpoint | null>;
  abstract insertCheckpoint(checkpoint: NewCheckpoint): Promise<string>;
  abstract updateCheckpoint(id: string, changes: CheckpointChanges): Promise<void>;
  abstract setPositions(positions: readonly { id: string; position: number }[]): Promise<void>;
  abstract setTagSecret(id: string, secret: string): Promise<void>;
}

export interface PatrolRound {
  id: string;
  routeId: string;
  employeeId: string;
  shiftId: string;
  status: PatrolRoundStatus;
  startedAt: Date;
  finishedAt: Date | null;
  checkpointCount: number;
}

export interface PatrolScan {
  roundId: string;
  checkpointId: string;
  scannedAt: Date;
  distanceM: number | null;
  locationVerified: boolean | null;
}

export type NewPatrolScan = PatrolScan & {
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
};

/** All methods require a tenant unit of work. */
export abstract class PatrolRoundRepository {
  abstract findById(id: string): Promise<PatrolRound | null>;
  abstract openRound(routeId: string, employeeId: string): Promise<PatrolRound | null>;
  /** Null when another open round won a race; read it with `openRound`. */
  abstract start(round: Omit<PatrolRound, 'id' | 'status' | 'finishedAt'>): Promise<string | null>;
  abstract finish(id: string, status: PatrolRoundStatus, at: Date): Promise<void>;
  /** False when this checkpoint was already scanned in the round. */
  abstract addScan(scan: NewPatrolScan): Promise<boolean>;
  abstract scans(roundIds: readonly string[]): Promise<PatrolScan[]>;
  /** Rounds of the routes started within [start, end), newest first. */
  abstract forRoutes(routeIds: readonly string[], start: Date, end: Date): Promise<PatrolRound[]>;
  /** The latest finished round of each route by this employee during the shift. */
  abstract lastFinished(employeeId: string, shiftId: string): Promise<Map<string, Date>>;
}
