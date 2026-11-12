import { Injectable } from '@nestjs/common';
import type {
  MyPatrol,
  PatrolProgress,
  PatrolRoundsQuery,
  PatrolRoundStatus,
  PatrolRoundView,
  PatrolScanResult,
  RecordPatrolScanRequest,
} from '@xrostr/contracts';
import { Clock, UnitOfWork } from '../../../shared/application/ports.js';
import { distanceMeters, withinGeofence } from '../../../shared/domain/geo.js';
import { localDaysToUtcRange, utcToLocal } from '../../../shared/domain/local-time.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import type { Principal } from '../../identity/public-api.js';
import { SchedulingDirectory } from '../../scheduling/public-api.js';
import { WorkforceDirectory } from '../../workforce/public-api.js';
import { PatrolErrors } from '../domain/patrol-errors.js';
import {
  PatrolRoundRepository,
  PatrolRouteRepository,
  type PatrolCheckpoint,
  type PatrolRound,
  type PatrolRoute,
  type PatrolScan,
} from './ports.js';

const tenantOf = (actor: Principal) => actor.subject.tenantId!;
/** Patrol scans count from shortly before a shift starts until shortly after it ends. */
export const PATROL_GRACE_MS = 30 * 60_000;
const MAX_RANGE_DAYS = 62;
const dayCount = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
const active = (checkpoints: PatrolCheckpoint[]) =>
  checkpoints.filter((c) => c.status === 'active');

/**
 * Officers patrol by scanning checkpoint tags (QR code or NFC sticker) during a published shift
 * at the route's site. The first scan starts a round; scanning every checkpoint completes it.
 * A position outside the checkpoint radius is recorded and flagged, not refused, so patrols in
 * basements and stairwells with poor GPS still count.
 */
@Injectable()
export class PatrolService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly routes: PatrolRouteRepository,
    private readonly rounds: PatrolRoundRepository,
    private readonly workforce: WorkforceDirectory,
    private readonly scheduling: SchedulingDirectory,
    private readonly clock: Clock,
  ) {}

  scan(actor: Principal, input: RecordPatrolScanRequest): Promise<Result<PatrolScanResult>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const now = this.clock.now();
      const me = await this.workforce.employeeOfUser(actor.subject.id);
      if (!me || me.status !== 'active') return err(PatrolErrors.notAnEmployee());
      const checkpoint = await this.routes.checkpointByTag(input.tag);
      const route = checkpoint && (await this.routes.findById(checkpoint.routeId));
      if (!checkpoint || checkpoint.status !== 'active' || !route || route.status !== 'active')
        return err(PatrolErrors.invalidTag());
      const shift = await this.scheduling.runningShift(me.id, now, PATROL_GRACE_MS);
      if (!shift || shift.locationId !== route.locationId) return err(PatrolErrors.outsideShift());

      const checkpoints = active(await this.routes.checkpoints([route.id]));
      const round = await this.roundFor(route, me.id, shift.id, checkpoints.length, now);

      let distanceM: number | null = null;
      let locationVerified: boolean | null = null;
      if (checkpoint.latitude != null && checkpoint.longitude != null && input.latitude != null) {
        distanceM = Math.round(
          distanceMeters(
            { latitude: input.latitude, longitude: input.longitude! },
            { latitude: checkpoint.latitude, longitude: checkpoint.longitude },
          ),
        );
        locationVerified = withinGeofence(distanceM, checkpoint.radiusM, input.accuracy);
      }
      const added = await this.rounds.addScan({
        roundId: round.id,
        checkpointId: checkpoint.id,
        scannedAt: now,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracyM: input.accuracy != null ? Math.round(input.accuracy) : null,
        distanceM,
        locationVerified,
      });

      const scans = await this.rounds.scans([round.id]);
      let status = round.status;
      if (checkpoints.every((c) => scans.some((s) => s.checkpointId === c.id))) {
        await this.rounds.finish(round.id, 'completed', now);
        status = 'completed';
      }
      const location = await this.workforce.location(route.locationId);
      return ok({
        checkpoint: { id: checkpoint.id, name: checkpoint.name },
        alreadyScanned: !added,
        locationVerified,
        distanceM,
        round: progress(
          { ...round, status, finishedAt: status === 'completed' ? now : null },
          route,
          location?.name ?? '',
          checkpoints,
          scans,
        ),
      });
    });
  }

  /** The routes at the site of the shift the officer is on now, with any round in progress. */
  mine(actor: Principal): Promise<Result<MyPatrol>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const me = await this.workforce.employeeOfUser(actor.subject.id);
      if (!me) return err(PatrolErrors.notAnEmployee());
      const shift = await this.scheduling.runningShift(me.id, this.clock.now(), PATROL_GRACE_MS);
      const location = shift && (await this.workforce.location(shift.locationId));
      if (!shift || !location) return ok({ shift: null, routes: [] });

      const routes = (await this.routes.forLocation(location.id)).filter(
        (r) => r.status === 'active',
      );
      const checkpoints = await this.routes.checkpoints(routes.map((r) => r.id));
      const finished = await this.rounds.lastFinished(me.id, shift.id);
      const result: MyPatrol['routes'] = [];
      for (const route of routes) {
        const own = active(checkpoints.filter((c) => c.routeId === route.id));
        const open = await this.rounds.openRound(route.id, me.id);
        const round = open?.shiftId === shift.id ? open : null;
        const scans = round ? await this.rounds.scans([round.id]) : [];
        result.push({
          route: { id: route.id, name: route.name, intervalMinutes: route.intervalMinutes },
          checkpoints: own.map((c) => ({ id: c.id, name: c.name, position: c.position })),
          round: round ? progress(round, route, location.name, own, scans) : null,
          lastFinishedAt: finished.get(route.id)?.toISOString() ?? null,
        });
      }
      return ok({
        shift: {
          id: shift.id,
          locationName: location.name,
          localStart: utcToLocal(shift.startsAt, location.timezone).time,
          localEnd: utcToLocal(shift.endsAt, location.timezone).time,
          timezone: location.timezone,
        },
        routes: result,
      });
    });
  }

  /** Ends the officer's own round early; it counts as complete only if nothing was missed. */
  finish(actor: Principal, roundId: string): Promise<Result<PatrolProgress>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const me = await this.workforce.employeeOfUser(actor.subject.id);
      const round = await this.rounds.findById(roundId);
      if (!me || !round || round.employeeId !== me.id) return err(PatrolErrors.roundNotFound());
      if (round.status !== 'in_progress') return err(PatrolErrors.roundClosed());
      const route = (await this.routes.findById(round.routeId))!;
      const checkpoints = active(await this.routes.checkpoints([route.id]));
      const scans = await this.rounds.scans([round.id]);
      const status: PatrolRoundStatus = checkpoints.every((c) =>
        scans.some((s) => s.checkpointId === c.id),
      )
        ? 'completed'
        : 'incomplete';
      const now = this.clock.now();
      await this.rounds.finish(round.id, status, now);
      const location = await this.workforce.location(route.locationId);
      return ok(
        progress(
          { ...round, status, finishedAt: now },
          route,
          location?.name ?? '',
          checkpoints,
          scans,
        ),
      );
    });
  }

  /** Rounds at a site whose start falls on the site's local days from..to. */
  history(actor: Principal, query: PatrolRoundsQuery): Promise<Result<PatrolRoundView[]>> {
    if (dayCount(query.from, query.to) > MAX_RANGE_DAYS)
      return Promise.resolve(err(PatrolErrors.rangeTooLong()));
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const location = await this.workforce.location(query.locationId);
      if (!location) return err(PatrolErrors.locationNotFound());
      const routes = await this.routes.forLocation(location.id);
      const range = localDaysToUtcRange(query.from, query.to, location.timezone);
      const rounds = await this.rounds.forRoutes(
        routes.map((r) => r.id),
        range.start,
        range.end,
      );
      const [checkpoints, scans, employees] = await Promise.all([
        this.routes.checkpoints(routes.map((r) => r.id)),
        this.rounds.scans(rounds.map((r) => r.id)),
        this.workforce.employeesById(rounds.map((r) => r.employeeId)),
      ]);
      return ok(
        rounds.map((round) => {
          const route = routes.find((r) => r.id === round.routeId)!;
          const employee = employees.get(round.employeeId);
          const own = scans.filter((s) => s.roundId === round.id);
          const names = new Map(checkpoints.map((c) => [c.id, c.name]));
          return {
            id: round.id,
            route: { id: route.id, name: route.name },
            employee: {
              id: round.employeeId,
              fullName: employee?.fullName ?? '',
              employeeNo: employee?.employeeNo ?? '',
            },
            status: round.status,
            startedAt: round.startedAt.toISOString(),
            finishedAt: round.finishedAt?.toISOString() ?? null,
            total: round.checkpointCount,
            scans: own.map((s) => ({
              checkpointId: s.checkpointId,
              name: names.get(s.checkpointId) ?? '',
              scannedAt: s.scannedAt.toISOString(),
              locationVerified: s.locationVerified,
              distanceM: s.distanceM,
            })),
            missed:
              round.status === 'completed'
                ? []
                : active(checkpoints.filter((c) => c.routeId === route.id))
                    .filter((c) => !own.some((s) => s.checkpointId === c.id))
                    .map((c) => c.name),
          };
        }),
      );
    });
  }

  /**
   * The officer's open round on this route for this shift, starting one if needed. A round left
   * open from an earlier shift is closed as incomplete first.
   */
  private async roundFor(
    route: PatrolRoute,
    employeeId: string,
    shiftId: string,
    checkpointCount: number,
    now: Date,
  ): Promise<PatrolRound> {
    const open = await this.rounds.openRound(route.id, employeeId);
    if (open?.shiftId === shiftId) return open;
    if (open) await this.rounds.finish(open.id, 'incomplete', now);
    const id = await this.rounds.start({
      routeId: route.id,
      employeeId,
      shiftId,
      startedAt: now,
      checkpointCount,
    });
    // A simultaneous scan may have opened it first; use that one.
    return id
      ? (await this.rounds.findById(id))!
      : (await this.rounds.openRound(route.id, employeeId))!;
  }
}

function progress(
  round: PatrolRound,
  route: PatrolRoute,
  locationName: string,
  checkpoints: PatrolCheckpoint[],
  scans: PatrolScan[],
): PatrolProgress {
  const scanned = new Set(scans.filter((s) => s.roundId === round.id).map((s) => s.checkpointId));
  const next = checkpoints.find((c) => !scanned.has(c.id));
  return {
    roundId: round.id,
    route: { id: route.id, name: route.name },
    locationName,
    status: round.status,
    startedAt: round.startedAt.toISOString(),
    finishedAt: round.finishedAt?.toISOString() ?? null,
    scanned: checkpoints.filter((c) => scanned.has(c.id)).length,
    total: checkpoints.length,
    scannedCheckpointIds: [...scanned],
    next: next ? { id: next.id, name: next.name } : null,
  };
}
