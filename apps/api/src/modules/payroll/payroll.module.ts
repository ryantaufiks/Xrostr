import { Module } from '@nestjs/common';
import { LeaveModule } from '../leave/leave.module.js';
import { TenancyModule } from '../tenancy/tenancy.module.js';
import { WorkforceModule } from '../workforce/workforce.module.js';
import { PaySetupService } from './application/pay-setup.service.js';
import {
  BankAccountRepository,
  PayPolicyRepository,
  PayProfileRepository,
  TimesheetSource,
} from './application/ports.js';
import { TimesheetService } from './application/timesheet.service.js';
import {
  DrizzleBankAccountRepository,
  DrizzlePayPolicyRepository,
  DrizzlePayProfileRepository,
  DrizzleTimesheetSource,
} from './infrastructure/drizzle-payroll.repositories.js';
import { PayrollController } from './interface/http/payroll.controller.js';

@Module({
  imports: [TenancyModule, WorkforceModule, LeaveModule],
  controllers: [PayrollController],
  providers: [
    { provide: PayPolicyRepository, useClass: DrizzlePayPolicyRepository },
    { provide: PayProfileRepository, useClass: DrizzlePayProfileRepository },
    { provide: BankAccountRepository, useClass: DrizzleBankAccountRepository },
    { provide: TimesheetSource, useClass: DrizzleTimesheetSource },
    PaySetupService,
    TimesheetService,
  ],
})
export class PayrollModule {}
