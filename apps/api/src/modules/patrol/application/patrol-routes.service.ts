import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CreateCheckpointRequest,
  CreatePatrolRouteRequest,
  PatrolRouteView,
  PatrolTag,
  UpdateCheckpointRequest,
  UpdatePatrolRouteRequest,
} from '@xrostr/contracts';
import { AuditLogger, UnitOfWork } from '../../../shared/application/ports.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import type { Principal } from '../../identity/public-api.js';
import { WorkforceDirectory, type WorkforceLocation } from '../../workforce/public-api.js';
import { PatrolErrors } from '../domain/patrol-errors.js';
import { PatrolRouteRepository, type PatrolCheckpoint, type PatrolRoute } from './ports.js';

const tenantOf = (actor: Principal) => actor.subject.tenantId!;
const DEFAULT_RADIUS_M = 30;

export const tagPath = (checkpoint: Pick<PatrolCheckpoint, 'tagSecret'>) =>
  `/patrol?k=${checkpoint.tagSecret}`;

/** Planners set up routes and checkpoints per site and print their QR / NFC tags. */
@Injectable()
export class PatrolRoutesService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly routes: PatrolRouteRepository,
    private readonly workforce: WorkforceDirectory,
    private readonly audit: AuditLogger,
  ) {}

  list(actor: Principal, locationId: string): Promise<Result<PatrolRouteView[]>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const location = await this.workforce.location(locationId);
      if (!location) return err(PatrolErrors.locationNotFound());
      const routes = await this.routes.forLocation(locationId);
      return ok(await this.views(routes, location));
    });
  }

  get(actor: Principal, id: string): Promise<Result<PatrolRouteView>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      if (!(await this.routes.findById(id))) return err(PatrolErrors.routeNotFound());
      return ok(await this.view(id));
    });
  }

  create(actor: Principal, input: CreatePatrolRouteRequest): Promise<Result<PatrolRouteView>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const location = await this.workforce.location(input.locationId);
      if (!location) return err(PatrolErrors.locationNotFound());
      const id = await this.routes.insert({
        locationId: location.id,
        name: input.name,
        intervalMinutes: input.intervalMinutes ?? null,
      });
      if (!id) return err(PatrolErrors.routeNameTaken());
      await this.record(actor, 'patrol_route.created', id, { name: input.name });
      return ok(await this.view(id));
    });
  }

  update(
    actor: Principal,
    id: string,
    changes: UpdatePatrolRouteRequest,
  ): Promise<Result<PatrolRouteView>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      if (!(await this.routes.findById(id))) return err(PatrolErrors.routeNotFound());
      if (!(await this.routes.update(id, changes))) return err(PatrolErrors.routeNameTaken());
      await this.record(actor, 'patrol_route.updated', id, { ...changes });
      return ok(await this.view(id));
    });
  }

  addCheckpoint(
    actor: Principal,
    routeId: string,
    input: CreateCheckpointRequest,
  ): Promise<Result<PatrolRouteView>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const route = await this.routes.findById(routeId);
      if (!route) return err(PatrolErrors.routeNotFound());
      if (route.status !== 'active') return err(PatrolErrors.routeArchived());
      const existing = await this.routes.checkpoints([routeId]);
      const position = Math.max(0, ...existing.map((c) => c.position)) + 1;
      const id = await this.routes.insertCheckpoint({
        routeId,
        name: input.name,
        position,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        radiusM: input.radiusM ?? DEFAULT_RADIUS_M,
      });
      await this.record(actor, 'patrol_checkpoint.created', id, { routeId, name: input.name });
      return ok(await this.view(routeId));
    });
  }

  updateCheckpoint(
    actor: Principal,
    id: string,
    changes: UpdateCheckpointRequest,
  ): Promise<Result<PatrolRouteView>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const checkpoint = await this.routes.findCheckpoint(id);
      if (!checkpoint) return err(PatrolErrors.checkpointNotFound());
      await this.routes.updateCheckpoint(id, changes);
      await this.record(actor, 'patrol_checkpoint.updated', id, { ...changes });
      return ok(await this.view(checkpoint.routeId));
    });
  }

  /** Sets the walking order; every active checkpoint must be listed exactly once. */
  reorder(
    actor: Principal,
    routeId: string,
    ids: readonly string[],
  ): Promise<Result<PatrolRouteView>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      if (!(await this.routes.findById(routeId))) return err(PatrolErrors.routeNotFound());
      const active = (await this.routes.checkpoints([routeId])).filter(
        (c) => c.status === 'active',
      );
      const wanted = new Set(ids);
      if (
        wanted.size !== ids.length ||
        active.length !== ids.length ||
        active.some((c) => !wanted.has(c.id))
      )
        return err(PatrolErrors.reorderMismatch());
      await this.routes.setPositions(ids.map((id, i) => ({ id, position: i + 1 })));
      return ok(await this.view(routeId));
    });
  }

  /** The links to put in each active checkpoint's QR code or NFC sticker. */
  tags(actor: Principal, routeId: string): Promise<Result<PatrolTag[]>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      if (!(await this.routes.findById(routeId))) return err(PatrolErrors.routeNotFound());
      const checkpoints = await this.routes.checkpoints([routeId]);
      return ok(checkpoints.filter((c) => c.status === 'active').map(toTag));
    });
  }

  /** A new secret for one checkpoint: its old QR code or NFC sticker stops working. */
  rotateTag(actor: Principal, id: string): Promise<Result<PatrolTag>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const checkpoint = await this.routes.findCheckpoint(id);
      if (!checkpoint) return err(PatrolErrors.checkpointNotFound());
      const tagSecret = randomBytes(32).toString('hex');
      await this.routes.setTagSecret(id, tagSecret);
      await this.record(actor, 'patrol_checkpoint.tag_rotated', id, {});
      return ok(toTag({ ...checkpoint, tagSecret }));
    });
  }

  private async view(routeId: string): Promise<PatrolRouteView> {
    const route = (await this.routes.findById(routeId))!;
    const location = (await this.workforce.location(route.locationId))!;
    return (await this.views([route], location))[0]!;
  }

  private async views(
    routes: PatrolRoute[],
    location: WorkforceLocation,
  ): Promise<PatrolRouteView[]> {
    const checkpoints = await this.routes.checkpoints(routes.map((r) => r.id));
    return routes.map((route) => ({
      id: route.id,
      name: route.name,
      intervalMinutes: route.intervalMinutes,
      status: route.status,
      location: {
        id: location.id,
        name: location.name,
        code: location.code,
        timezone: location.timezone,
      },
      checkpoints: checkpoints
        .filter((c) => c.routeId === route.id)
        // Active ones in walking order, archived ones after them.
        .sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active'))
        .map((c) => ({
          id: c.id,
          name: c.name,
          position: c.position,
          latitude: c.latitude,
          longitude: c.longitude,
          radiusM: c.radiusM,
          status: c.status,
        })),
    }));
  }

  private record(actor: Principal, action: string, id: string, metadata: Record<string, unknown>) {
    return this.audit.recordTenant({
      actorType: 'user',
      actorId: actor.subject.id,
      action,
      targetType: action.startsWith('patrol_route') ? 'patrol_route' : 'patrol_checkpoint',
      targetId: id,
      metadata,
    });
  }
}

const toTag = (c: PatrolCheckpoint): PatrolTag => ({
  checkpointId: c.id,
  name: c.name,
  position: c.position,
  path: tagPath(c),
});
