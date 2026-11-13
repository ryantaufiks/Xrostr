import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  bankAccountSchema,
  payPolicySchema,
  payProfileQuerySchema,
  payProfileSchema,
  timesheetCorrectionSchema,
  timesheetQuerySchema,
  type BankAccountRequest,
  type BankAccountView,
  type PayPolicyRequest,
  type PayPolicyView,
  type PayProfileRequest,
  type PayProfileView,
  type TimesheetCorrectionRequest,
  type TimesheetQuery,
  type TimesheetView,
} from '@xrostr/contracts';
import { unwrap } from '../../../../shared/interface/http/domain-error.exception.js';
import { ZodValidationPipe } from '../../../../shared/interface/http/zod-validation.pipe.js';
import {
  CurrentPrincipal,
  RequirePermissions,
  TenantUser,
  type Principal,
} from '../../../identity/public-api.js';
import { PaySetupService } from '../../application/pay-setup.service.js';
import { TimesheetService } from '../../application/timesheet.service.js';

@Controller()
export class PayrollController {
  constructor(
    private readonly setup: PaySetupService,
    private readonly timesheets: TimesheetService,
  ) {}

  @RequirePermissions('payroll.read')
  @Get('tenant/pay-policies')
  async policies(@CurrentPrincipal() actor: Principal): Promise<PayPolicyView[]> {
    return this.setup.listPolicies(actor);
  }

  @RequirePermissions('payroll.manage')
  @Put('tenant/legal-entities/:id/pay-policy')
  async savePolicy(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(payPolicySchema)) body: PayPolicyRequest,
  ): Promise<PayPolicyView> {
    return unwrap(await this.setup.savePolicy(actor, id, body));
  }

  @RequirePermissions('payroll.read')
  @Get('tenant/employees/:id/pay-profile')
  async profile(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(payProfileQuerySchema)) query: { reveal: boolean },
  ): Promise<PayProfileView> {
    return unwrap(await this.setup.profile(actor, id, query.reveal));
  }

  @RequirePermissions('payroll.manage')
  @Put('tenant/employees/:id/pay-profile')
  async saveProfile(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(payProfileSchema)) body: PayProfileRequest,
  ): Promise<PayProfileView> {
    return unwrap(await this.setup.saveProfile(actor, id, body));
  }

  @RequirePermissions('payroll.manage')
  @Put('tenant/employees/:id/bank-account')
  async saveBankAccount(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(bankAccountSchema)) body: BankAccountRequest,
  ): Promise<BankAccountView> {
    return unwrap(await this.setup.saveBankAccount(actor, id, body));
  }

  /** Timesheets carry no money, so planners can read them as well as payroll staff. */
  @RequirePermissions('schedules.read')
  @Get('tenant/timesheets')
  async timesheet(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(timesheetQuerySchema)) query: TimesheetQuery,
  ): Promise<TimesheetView> {
    return unwrap(await this.timesheets.view(actor, query));
  }

  /** Planners (`schedules.manage`) or payroll staff (`payroll.manage`); checked in the service. */
  @TenantUser()
  @Post('tenant/timesheets/:shiftId/corrections')
  @HttpCode(204)
  async correct(
    @CurrentPrincipal() actor: Principal,
    @Param('shiftId', ParseUUIDPipe) shiftId: string,
    @Body(new ZodValidationPipe(timesheetCorrectionSchema)) body: TimesheetCorrectionRequest,
  ): Promise<void> {
    unwrap(await this.timesheets.correct(actor, shiftId, body));
  }
}
