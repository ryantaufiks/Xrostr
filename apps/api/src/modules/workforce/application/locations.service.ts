import { Injectable } from '@nestjs/common';
import type { CreateLocationRequest, LocationView, UpdateLocationRequest } from '@xrostr/contracts';
import { AuditLogger, UnitOfWork } from '../../../shared/application/ports.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import type { Principal } from '../../identity/public-api.js';
import { LegalEntityDirectory, type LegalEntityWithPack } from '../../tenancy/public-api.js';
import { WorkforceErrors } from '../domain/workforce-errors.js';
import { LocationRepository, type Location } from './ports.js';

const tenantOf = (actor: Principal) => actor.subject.tenantId!;

@Injectable()
export class LocationsService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly locations: LocationRepository,
    private readonly entities: LegalEntityDirectory,
    private readonly audit: AuditLogger,
  ) {}

  list(actor: Principal): Promise<LocationView[]> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const [locations, entities] = await Promise.all([
        this.locations.list(),
        this.entities.list(),
      ]);
      return locations.map((l) => toView(l, entities));
    });
  }

  create(actor: Principal, input: CreateLocationRequest): Promise<Result<LocationView>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const entity = await this.entities.find(input.legalEntityId);
      if (!entity) return err(WorkforceErrors.legalEntityNotFound());
      if (!entity.pack.timezones.includes(input.timezone)) {
        return err(WorkforceErrors.timezoneNotInCountry(input.timezone, entity.pack.name));
      }
      if (await this.locations.codeExists(input.code))
        return err(WorkforceErrors.locationCodeTaken());

      const id = await this.locations.insert({
        legalEntityId: entity.id,
        name: input.name,
        code: input.code,
        address: input.address ?? null,
        timezone: input.timezone,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        geofenceRadiusM: input.geofenceRadiusM,
      });
      await this.record(actor, 'location.created', id, { code: input.code });
      return ok(toView((await this.locations.findById(id))!, [entity]));
    });
  }

  update(
    actor: Principal,
    id: string,
    input: UpdateLocationRequest,
  ): Promise<Result<LocationView>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const current = await this.locations.findById(id);
      if (!current) return err(WorkforceErrors.locationNotFound());
      const entities = await this.entities.list();
      const entity = entities.find((e) => e.id === current.legalEntityId)!;
      if (input.timezone && !entity.pack.timezones.includes(input.timezone)) {
        return err(WorkforceErrors.timezoneNotInCountry(input.timezone, entity.pack.name));
      }
      if (input.code && (await this.locations.codeExists(input.code, id))) {
        return err(WorkforceErrors.locationCodeTaken());
      }

      await this.locations.update(id, input);
      await this.record(actor, 'location.updated', id, { fields: Object.keys(input) });
      return ok(toView((await this.locations.findById(id))!, entities));
    });
  }

  private record(actor: Principal, action: string, id: string, metadata: Record<string, unknown>) {
    return this.audit.recordTenant({
      actorType: 'user',
      actorId: actor.subject.id,
      action,
      targetType: 'location',
      targetId: id,
      metadata,
    });
  }
}

function toView(location: Location, entities: LegalEntityWithPack[]): LocationView {
  const entity = entities.find((e) => e.id === location.legalEntityId);
  return {
    id: location.id,
    name: location.name,
    code: location.code,
    address: location.address,
    timezone: location.timezone,
    latitude: location.latitude,
    longitude: location.longitude,
    geofenceRadiusM: location.geofenceRadiusM,
    status: location.status,
    legalEntity: {
      id: location.legalEntityId,
      name: entity?.name ?? '',
      countryCode: entity?.countryCode ?? '',
    },
  };
}
