import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  rosterSuggestionsQuerySchema,
  rotationSchema,
  type RosterQuery,
  type RosterSuggestionsView,
  type RotationResult,
} from '@xrostr/contracts';
import type { z } from 'zod';
import { unwrap } from '../../../../shared/interface/http/domain-error.exception.js';
import { ZodValidationPipe } from '../../../../shared/interface/http/zod-validation.pipe.js';
import {
  CurrentPrincipal,
  RequirePermissions,
  type Principal,
} from '../../../identity/public-api.js';
import { PlanningService } from '../../application/planning.service.js';

@Controller()
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  @RequirePermissions('schedules.manage')
  @Post('tenant/roster/rotation')
  @HttpCode(200)
  async rotation(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(rotationSchema)) body: z.output<typeof rotationSchema>,
  ): Promise<RotationResult> {
    return unwrap(await this.planning.rotation(actor, body));
  }

  @RequirePermissions('schedules.manage')
  @Get('tenant/roster/suggestions')
  async suggestions(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(rosterSuggestionsQuerySchema)) query: RosterQuery,
  ): Promise<RosterSuggestionsView> {
    return unwrap(await this.planning.suggestions(actor, query));
  }
}
