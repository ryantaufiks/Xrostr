import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import {
  createZoneSchema,
  rovingVisitsQuerySchema,
  updateZoneTargetsSchema,
  type RovingShiftVisits,
  type RovingVisitsQuery,
  type CreateZoneRequest,
  type UpdateZoneTargetsRequest,
  type ZoneView,
} from '@xrostr/contracts';
import { unwrap } from '../../../../shared/interface/http/domain-error.exception.js';
import { ZodValidationPipe } from '../../../../shared/interface/http/zod-validation.pipe.js';
import {
  CurrentPrincipal,
  RequirePermissions,
  type Principal,
} from '../../../identity/public-api.js';
import { RovingVisitsService } from '../../application/roving-visits.service.js';
import { ZonesService } from '../../application/zones.service.js';

@Controller()
export class ZonesController {
  constructor(
    private readonly zones: ZonesService,
    private readonly visits: RovingVisitsService,
  ) {}

  @RequirePermissions('schedules.read')
  @Get('tenant/roving/visits')
  async rovingVisits(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(rovingVisitsQuerySchema)) query: RovingVisitsQuery,
  ): Promise<RovingShiftVisits[]> {
    return this.visits.forDate(actor, query.date);
  }

  @RequirePermissions('schedules.read')
  @Get('tenant/zones')
  async list(@CurrentPrincipal() actor: Principal): Promise<ZoneView[]> {
    return this.zones.list(actor);
  }

  @RequirePermissions('schedules.manage')
  @Post('tenant/zones')
  async create(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(createZoneSchema)) body: CreateZoneRequest,
  ): Promise<ZoneView> {
    return unwrap(await this.zones.create(actor, body));
  }

  @RequirePermissions('schedules.manage')
  @Put('tenant/zones/:id/targets')
  async updateTargets(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateZoneTargetsSchema)) body: UpdateZoneTargetsRequest,
  ): Promise<ZoneView> {
    return unwrap(await this.zones.updateTargets(actor, id, body));
  }
}
