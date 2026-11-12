import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  createHolidaySchema,
  decideLeaveSchema,
  holidayQuerySchema,
  leaveQueueQuerySchema,
  myLeaveQuerySchema,
  requestLeaveSchema,
  type CreateHolidayRequest,
  type DecideLeaveRequest,
  type HolidayQuery,
  type HolidayView,
  type LeaveQueueQuery,
  type LeaveRequestView,
  type MyLeave,
  type MyLeaveQuery,
  type RequestLeaveRequest,
} from '@xrostr/contracts';
import { unwrap } from '../../../../shared/interface/http/domain-error.exception.js';
import { ZodValidationPipe } from '../../../../shared/interface/http/zod-validation.pipe.js';
import {
  CurrentPrincipal,
  RequirePermissions,
  TenantUser,
  type Principal,
} from '../../../identity/public-api.js';
import { HolidaysService } from '../../application/holidays.service.js';
import { LeaveService } from '../../application/leave.service.js';

@Controller()
export class LeaveController {
  constructor(
    private readonly leave: LeaveService,
    private readonly holidays: HolidaysService,
  ) {}

  @TenantUser()
  @Get('me/leave')
  async mine(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(myLeaveQuerySchema)) query: MyLeaveQuery,
  ): Promise<MyLeave> {
    return unwrap(await this.leave.myLeave(actor, query.year));
  }

  @TenantUser()
  @Post('me/leave')
  async request(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(requestLeaveSchema)) body: RequestLeaveRequest,
  ): Promise<LeaveRequestView> {
    return unwrap(await this.leave.request(actor, body));
  }

  @TenantUser()
  @Post('me/leave/:id/cancel')
  @HttpCode(204)
  async cancel(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    unwrap(await this.leave.cancel(actor, id));
  }

  @RequirePermissions('leave.approve')
  @Get('tenant/leave/requests')
  queue(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(leaveQueueQuerySchema)) query: LeaveQueueQuery,
  ): Promise<LeaveRequestView[]> {
    return this.leave.queue(actor, query.status);
  }

  @RequirePermissions('leave.approve')
  @Post('tenant/leave/requests/:id/decision')
  @HttpCode(200)
  async decide(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decideLeaveSchema)) body: DecideLeaveRequest,
  ): Promise<LeaveRequestView> {
    return unwrap(await this.leave.decide(actor, id, body));
  }

  @TenantUser()
  @Get('tenant/holidays')
  listHolidays(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(holidayQuerySchema)) query: HolidayQuery,
  ): Promise<HolidayView[]> {
    return this.holidays.list(actor, query.countryCode, query.year);
  }

  @RequirePermissions('holidays.manage')
  @Post('tenant/holidays')
  async createHoliday(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(createHolidaySchema)) body: CreateHolidayRequest,
  ): Promise<HolidayView> {
    return unwrap(await this.holidays.create(actor, body));
  }

  @RequirePermissions('holidays.manage')
  @Delete('tenant/holidays/:id')
  @HttpCode(204)
  async removeHoliday(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    unwrap(await this.holidays.remove(actor, id));
  }
}
