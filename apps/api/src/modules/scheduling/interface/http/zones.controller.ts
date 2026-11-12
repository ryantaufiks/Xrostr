import { Body, Controller, Get, Post } from '@nestjs/common';
import { createZoneSchema, type CreateZoneRequest, type ZoneView } from '@xrostr/contracts';
import { unwrap } from '../../../../shared/interface/http/domain-error.exception.js';
import { ZodValidationPipe } from '../../../../shared/interface/http/zod-validation.pipe.js';
import {
  CurrentPrincipal,
  RequirePermissions,
  type Principal,
} from '../../../identity/public-api.js';
import { ZonesService } from '../../application/zones.service.js';

@Controller()
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

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
}
