import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const PATROL_ROUND_STATUSES = ['in_progress', 'completed', 'incomplete'] as const;
export type PatrolRoundStatus = (typeof PATROL_ROUND_STATUSES)[number];

export const PATROL_STATUSES = ['active', 'archived'] as const;
export type PatrolStatus = (typeof PATROL_STATUSES)[number];

const name = z.string().trim().min(2).max(100);
/** How often a round is expected during a shift, in minutes; null when not scheduled. */
const intervalMinutes = z.number().int().min(15).max(1440).nullable();
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
const radiusM = z.number().int().min(5).max(500);

/** Latitude and longitude come together or not at all. */
const pointTogether = (v: { latitude?: number | null; longitude?: number | null }) =>
  (v.latitude == null) === (v.longitude == null);
const pointMessage = { path: ['longitude'], message: 'Give latitude and longitude together' };

export const createPatrolRouteSchema = z.object({
  locationId: z.uuid(),
  name,
  intervalMinutes: intervalMinutes.optional(),
});
export type CreatePatrolRouteRequest = z.infer<typeof createPatrolRouteSchema>;

export const updatePatrolRouteSchema = z
  .object({
    name: name.optional(),
    intervalMinutes: intervalMinutes.optional(),
    status: z.enum(PATROL_STATUSES).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to change' });
export type UpdatePatrolRouteRequest = z.infer<typeof updatePatrolRouteSchema>;

export const createCheckpointSchema = z
  .object({
    name,
    latitude: latitude.nullable().optional(),
    longitude: longitude.nullable().optional(),
    radiusM: radiusM.optional(),
  })
  .refine(pointTogether, pointMessage);
export type CreateCheckpointRequest = z.infer<typeof createCheckpointSchema>;

export const updateCheckpointSchema = z
  .object({
    name: name.optional(),
    latitude: latitude.nullable().optional(),
    longitude: longitude.nullable().optional(),
    radiusM: radiusM.optional(),
    status: z.enum(PATROL_STATUSES).optional(),
  })
  .refine(pointTogether, pointMessage)
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to change' });
export type UpdateCheckpointRequest = z.infer<typeof updateCheckpointSchema>;

/** The route's active checkpoints in their new walking order. */
export const reorderCheckpointsSchema = z.object({ checkpointIds: z.array(z.uuid()).min(1) });
export type ReorderCheckpointsRequest = z.infer<typeof reorderCheckpointsSchema>;

export interface PatrolCheckpointView {
  id: string;
  name: string;
  position: number;
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  status: PatrolStatus;
}

export interface PatrolRouteView {
  id: string;
  name: string;
  intervalMinutes: number | null;
  status: PatrolStatus;
  location: { id: string; name: string; code: string; timezone: string };
  /** Walking order; archived checkpoints come last. */
  checkpoints: PatrolCheckpointView[];
}

/** What goes into a checkpoint's QR code or NFC sticker: a link that records the scan. */
export interface PatrolTag {
  checkpointId: string;
  name: string;
  position: number;
  path: string;
}

/** Sent by the officer's phone after scanning a checkpoint tag. Position is optional. */
export const recordPatrolScanSchema = z
  .object({
    tag: z.string().min(16).max(128),
    latitude: latitude.optional(),
    longitude: longitude.optional(),
    accuracy: z.number().min(0).max(10_000).optional(),
  })
  .refine(pointTogether, pointMessage);
export type RecordPatrolScanRequest = z.infer<typeof recordPatrolScanSchema>;

export interface PatrolProgress {
  roundId: string;
  route: { id: string; name: string };
  locationName: string;
  status: PatrolRoundStatus;
  startedAt: string;
  finishedAt: string | null;
  scanned: number;
  total: number;
  scannedCheckpointIds: string[];
  /** The first checkpoint in walking order not yet scanned. */
  next: { id: string; name: string } | null;
}

export interface PatrolScanResult {
  checkpoint: { id: string; name: string };
  /** The checkpoint was already scanned in this round; nothing new was recorded. */
  alreadyScanned: boolean;
  /** Inside the checkpoint radius; null when the checkpoint has no point or no GPS was sent. */
  locationVerified: boolean | null;
  distanceM: number | null;
  round: PatrolProgress;
}

/** The officer's patrol screen: routes at the site of the shift they are on now. */
export interface MyPatrol {
  shift: {
    id: string;
    locationName: string;
    localStart: string;
    localEnd: string;
    timezone: string;
  } | null;
  routes: {
    route: { id: string; name: string; intervalMinutes: number | null };
    checkpoints: { id: string; name: string; position: number }[];
    round: PatrolProgress | null;
    lastFinishedAt: string | null;
  }[];
}

export const patrolRoundsQuerySchema = z
  .object({ locationId: z.uuid(), from: isoDate, to: isoDate })
  .refine((v) => v.from <= v.to, { path: ['to'], message: 'End must not be before start' });
export type PatrolRoundsQuery = z.infer<typeof patrolRoundsQuerySchema>;

export interface PatrolRoundView {
  id: string;
  route: { id: string; name: string };
  employee: { id: string; fullName: string; employeeNo: string };
  status: PatrolRoundStatus;
  startedAt: string;
  finishedAt: string | null;
  total: number;
  scans: {
    checkpointId: string;
    name: string;
    scannedAt: string;
    locationVerified: boolean | null;
    distanceM: number | null;
  }[];
  /** Checkpoints of the route not scanned in this round, in walking order. */
  missed: string[];
}
