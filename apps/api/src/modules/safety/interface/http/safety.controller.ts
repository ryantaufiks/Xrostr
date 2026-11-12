import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  alertsQuerySchema,
  raiseSosSchema,
  resolveAlertSchema,
  respondWelfareSchema,
  type AlertsQuery,
  type AlertView,
  type MySafety,
  type RaiseSosRequest,
  type ResolveAlertRequest,
  type RespondWelfareRequest,
} from '@xrostr/contracts';
import { unwrap } from '../../../../shared/interface/http/domain-error.exception.js';
import { ZodValidationPipe } from '../../../../shared/interface/http/zod-validation.pipe.js';
import {
  CurrentPrincipal,
  RequirePermissions,
  TenantUser,
  type Principal,
} from '../../../identity/public-api.js';
import { SafetyService } from '../../application/safety.service.js';

@Controller()
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @TenantUser()
  @Get('me/safety')
  async mine(@CurrentPrincipal() actor: Principal): Promise<MySafety> {
    return unwrap(await this.safety.mine(actor));
  }

  @TenantUser()
  @Post('me/sos')
  async sos(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(raiseSosSchema)) body: RaiseSosRequest,
  ): Promise<AlertView> {
    return unwrap(await this.safety.raiseSos(actor, body));
  }

  @TenantUser()
  @Post('me/welfare/:id/respond')
  @HttpCode(204)
  async respond(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(respondWelfareSchema)) body: RespondWelfareRequest,
  ): Promise<void> {
    unwrap(await this.safety.respondWelfare(actor, id, body));
  }

  @RequirePermissions('alerts.respond')
  @Get('tenant/alerts')
  list(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(alertsQuerySchema)) query: AlertsQuery,
  ): Promise<AlertView[]> {
    return this.safety.list(actor, query.status === 'open');
  }

  @RequirePermissions('alerts.respond')
  @Post('tenant/alerts/:id/acknowledge')
  @HttpCode(200)
  async acknowledge(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AlertView> {
    return unwrap(await this.safety.acknowledge(actor, id));
  }

  @RequirePermissions('alerts.respond')
  @Post('tenant/alerts/:id/resolve')
  @HttpCode(200)
  async resolve(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resolveAlertSchema)) body: ResolveAlertRequest,
  ): Promise<AlertView> {
    return unwrap(await this.safety.resolve(actor, id, body.note));
  }
}
