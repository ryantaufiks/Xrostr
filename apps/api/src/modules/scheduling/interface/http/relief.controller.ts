import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  reliefQuerySchema,
  sendReliefSchema,
  type MyReliefOffer,
  type ReliefCandidate,
  type ReliefQuery,
  type ReliefRequestView,
  type SendReliefRequest,
} from '@xrostr/contracts';
import { unwrap } from '../../../../shared/interface/http/domain-error.exception.js';
import { ZodValidationPipe } from '../../../../shared/interface/http/zod-validation.pipe.js';
import {
  CurrentPrincipal,
  RequirePermissions,
  TenantUser,
  type Principal,
} from '../../../identity/public-api.js';
import { ReliefService } from '../../application/relief.service.js';

@Controller()
export class ReliefController {
  constructor(private readonly relief: ReliefService) {}

  @RequirePermissions('schedules.manage')
  @Get('tenant/shifts/:id/relief/candidates')
  async candidates(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReliefCandidate[]> {
    return unwrap(await this.relief.candidates(actor, id));
  }

  @RequirePermissions('schedules.manage')
  @Post('tenant/shifts/:id/relief')
  async send(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendReliefSchema)) body: SendReliefRequest,
  ): Promise<ReliefRequestView> {
    return unwrap(await this.relief.send(actor, id, body));
  }

  @RequirePermissions('schedules.read')
  @Get('tenant/relief')
  list(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(reliefQuerySchema)) query: ReliefQuery,
  ): Promise<ReliefRequestView[]> {
    return this.relief.list(actor, query);
  }

  @RequirePermissions('schedules.manage')
  @Post('tenant/relief/:id/cancel')
  @HttpCode(204)
  async cancel(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    unwrap(await this.relief.cancel(actor, id));
  }

  @TenantUser()
  @Get('me/relief')
  async mine(@CurrentPrincipal() actor: Principal): Promise<MyReliefOffer[]> {
    return unwrap(await this.relief.mine(actor));
  }

  @TenantUser()
  @Post('me/relief/:id/accept')
  @HttpCode(200)
  async accept(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MyReliefOffer> {
    return unwrap(await this.relief.accept(actor, id));
  }

  @TenantUser()
  @Post('me/relief/:id/decline')
  @HttpCode(204)
  async decline(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    unwrap(await this.relief.decline(actor, id));
  }
}
