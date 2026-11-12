import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  createCheckpointSchema,
  createPatrolRouteSchema,
  patrolRoundsQuerySchema,
  recordPatrolScanSchema,
  reorderCheckpointsSchema,
  updateCheckpointSchema,
  updatePatrolRouteSchema,
  type CreateCheckpointRequest,
  type CreatePatrolRouteRequest,
  type MyPatrol,
  type PatrolProgress,
  type PatrolRoundsQuery,
  type PatrolRoundView,
  type PatrolRouteView,
  type PatrolScanResult,
  type PatrolTag,
  type RecordPatrolScanRequest,
  type ReorderCheckpointsRequest,
  type UpdateCheckpointRequest,
  type UpdatePatrolRouteRequest,
} from '@xrostr/contracts';
import { z } from 'zod';
import { unwrap } from '../../../../shared/interface/http/domain-error.exception.js';
import { ZodValidationPipe } from '../../../../shared/interface/http/zod-validation.pipe.js';
import {
  CurrentPrincipal,
  RequirePermissions,
  TenantUser,
  type Principal,
} from '../../../identity/public-api.js';
import { PatrolRoutesService } from '../../application/patrol-routes.service.js';
import { PatrolService } from '../../application/patrol.service.js';

const locationQuerySchema = z.object({ locationId: z.uuid() });

@Controller()
export class PatrolController {
  constructor(
    private readonly routes: PatrolRoutesService,
    private readonly patrol: PatrolService,
  ) {}

  @RequirePermissions('patrols.read')
  @Get('tenant/patrol/routes')
  async list(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(locationQuerySchema)) query: { locationId: string },
  ): Promise<PatrolRouteView[]> {
    return unwrap(await this.routes.list(actor, query.locationId));
  }

  @RequirePermissions('patrols.read')
  @Get('tenant/patrol/routes/:id')
  async get(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PatrolRouteView> {
    return unwrap(await this.routes.get(actor, id));
  }

  @RequirePermissions('patrols.manage')
  @Post('tenant/patrol/routes')
  async create(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(createPatrolRouteSchema)) body: CreatePatrolRouteRequest,
  ): Promise<PatrolRouteView> {
    return unwrap(await this.routes.create(actor, body));
  }

  @RequirePermissions('patrols.manage')
  @Patch('tenant/patrol/routes/:id')
  async update(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePatrolRouteSchema)) body: UpdatePatrolRouteRequest,
  ): Promise<PatrolRouteView> {
    return unwrap(await this.routes.update(actor, id, body));
  }

  @RequirePermissions('patrols.manage')
  @Post('tenant/patrol/routes/:id/checkpoints')
  async addCheckpoint(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createCheckpointSchema)) body: CreateCheckpointRequest,
  ): Promise<PatrolRouteView> {
    return unwrap(await this.routes.addCheckpoint(actor, id, body));
  }

  @RequirePermissions('patrols.manage')
  @Put('tenant/patrol/routes/:id/order')
  async reorder(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reorderCheckpointsSchema)) body: ReorderCheckpointsRequest,
  ): Promise<PatrolRouteView> {
    return unwrap(await this.routes.reorder(actor, id, body.checkpointIds));
  }

  @RequirePermissions('patrols.manage')
  @Get('tenant/patrol/routes/:id/tags')
  async tags(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PatrolTag[]> {
    return unwrap(await this.routes.tags(actor, id));
  }

  @RequirePermissions('patrols.manage')
  @Patch('tenant/patrol/checkpoints/:id')
  async updateCheckpoint(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCheckpointSchema)) body: UpdateCheckpointRequest,
  ): Promise<PatrolRouteView> {
    return unwrap(await this.routes.updateCheckpoint(actor, id, body));
  }

  @RequirePermissions('patrols.manage')
  @Post('tenant/patrol/checkpoints/:id/tag/rotate')
  @HttpCode(200)
  async rotateTag(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PatrolTag> {
    return unwrap(await this.routes.rotateTag(actor, id));
  }

  @RequirePermissions('patrols.read')
  @Get('tenant/patrol/rounds')
  async history(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(patrolRoundsQuerySchema)) query: PatrolRoundsQuery,
  ): Promise<PatrolRoundView[]> {
    return unwrap(await this.patrol.history(actor, query));
  }

  @TenantUser()
  @Get('me/patrol')
  async mine(@CurrentPrincipal() actor: Principal): Promise<MyPatrol> {
    return unwrap(await this.patrol.mine(actor));
  }

  @TenantUser()
  @Post('me/patrol/scans')
  @HttpCode(200)
  async scan(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(recordPatrolScanSchema)) body: RecordPatrolScanRequest,
  ): Promise<PatrolScanResult> {
    return unwrap(await this.patrol.scan(actor, body));
  }

  @TenantUser()
  @Post('me/patrol/rounds/:id/finish')
  @HttpCode(200)
  async finish(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PatrolProgress> {
    return unwrap(await this.patrol.finish(actor, id));
  }
}
