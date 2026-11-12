import { Injectable } from '@nestjs/common';
import type { CreateZoneRequest, ZoneView } from '@xrostr/contracts';
import { AuditLogger, UnitOfWork } from '../../../shared/application/ports.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import type { Principal } from '../../identity/public-api.js';
import { WorkforceDirectory } from '../../workforce/public-api.js';
import { SchedulingErrors } from '../domain/scheduling-errors.js';
import { ZoneRepository } from './ports.js';

const tenantOf = (actor: Principal) => actor.subject.tenantId!;

/** Roving zones: a named set of sites an officer covers in one shift. */
@Injectable()
export class ZonesService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly zones: ZoneRepository,
    private readonly workforce: WorkforceDirectory,
    private readonly audit: AuditLogger,
  ) {}

  list(actor: Principal): Promise<ZoneView[]> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const zones = await this.zones.list();
      return zones.map((z) => ({
        id: z.id,
        name: z.name,
        locations: z.locations.map((l) => ({ id: l.id, name: l.name })),
      }));
    });
  }

  create(actor: Principal, input: CreateZoneRequest): Promise<Result<ZoneView>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      // Sites are looked up under the tenant's RLS context, so another tenant's site (or an
      // unknown id) is simply not found and can never be linked.
      const ids = [...new Set(input.locationIds)];
      const sites = await this.workforce.locationsById(ids);
      if (sites.size !== ids.length) return err(SchedulingErrors.locationNotFound());
      const members = [...sites.values()];
      if (members.some((s) => s.status !== 'active'))
        return err(SchedulingErrors.locationArchived());
      const [first] = members;
      if (
        members.some(
          (s) => s.legalEntityId !== first!.legalEntityId || s.timezone !== first!.timezone,
        )
      )
        return err(SchedulingErrors.zoneMixedSites());
      const id = await this.zones.insert(input.name, ids);
      if (!id) return err(SchedulingErrors.zoneNameTaken());
      const zone = (await this.zones.findById(id))!;
      await this.audit.recordTenant({
        actorType: 'user',
        actorId: actor.subject.id,
        action: 'zone.created',
        targetType: 'zone',
        targetId: id,
        metadata: { name: input.name, sites: input.locationIds.length },
      });
      return ok({
        id: zone.id,
        name: zone.name,
        locations: zone.locations.map((l) => ({ id: l.id, name: l.name })),
      });
    });
  }
}
