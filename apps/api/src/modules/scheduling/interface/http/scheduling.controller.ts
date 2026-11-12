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
  recordAttendanceSchema,
  type AttendanceResult,
  type RecordAttendanceRequest,
  createShiftSchema,
  myShiftsQuerySchema,
  publishRosterSchema,
  rosterQuerySchema,
  type CreateShiftRequest,
  type MyShiftsQuery,
  type PublishResult,
  type PublishRosterRequest,
  type RosterQuery,
  type ShiftView,
} from '@xrostr/contracts';
import { unwrap } from '../../../../shared/interface/http/domain-error.exception.js';
import { ZodValidationPipe } from '../../../../shared/interface/http/zod-validation.pipe.js';
import {
  CurrentPrincipal,
  RequirePermissions,
  TenantUser,
  type Principal,
} from '../../../identity/public-api.js';
import { AttendanceService } from '../../application/attendance.service.js';
import { SchedulingService } from '../../application/scheduling.service.js';

@Controller()
export class SchedulingController {
  constructor(
    private readonly scheduling: SchedulingService,
    private readonly attendance: AttendanceService,
  ) {}

  @RequirePermissions('schedules.read')
  @Get('tenant/roster')
  async roster(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(rosterQuerySchema)) query: RosterQuery,
  ): Promise<ShiftView[]> {
    return unwrap(await this.scheduling.roster(actor, query));
  }

  @RequirePermissions('schedules.manage')
  @Post('tenant/shifts')
  async create(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(createShiftSchema)) body: CreateShiftRequest,
  ): Promise<ShiftView> {
    return unwrap(await this.scheduling.create(actor, body));
  }

  @RequirePermissions('schedules.manage')
  @Delete('tenant/shifts/:id')
  @HttpCode(204)
  async remove(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    unwrap(await this.scheduling.remove(actor, id));
  }

  @RequirePermissions('schedules.manage')
  @Post('tenant/roster/publish')
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(publishRosterSchema)) body: PublishRosterRequest,
  ): Promise<PublishResult> {
    return unwrap(await this.scheduling.publish(actor, body));
  }

  @TenantUser()
  @Get('me/shifts')
  async mine(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(myShiftsQuerySchema)) query: MyShiftsQuery,
  ): Promise<ShiftView[]> {
    return unwrap(await this.scheduling.myShifts(actor, query));
  }

  /** Scan of a site QR code: checks in, or out when a check-in is open. */
  @TenantUser()
  @Post('me/attendance')
  @HttpCode(200)
  async record(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(recordAttendanceSchema)) body: RecordAttendanceRequest,
  ): Promise<AttendanceResult> {
    return unwrap(await this.attendance.record(actor, body));
  }
}
