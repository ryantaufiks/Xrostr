import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { TenancyModule } from '../tenancy/tenancy.module.js';
import { WorkforceModule } from '../workforce/workforce.module.js';
import { HolidaysService } from './application/holidays.service.js';
import { LeaveService } from './application/leave.service.js';
import { HolidayRepository, LeaveRequestRepository } from './application/ports.js';
import {
  DrizzleHolidayRepository,
  DrizzleLeaveRequestRepository,
} from './infrastructure/drizzle-leave.repositories.js';
import { LeaveController } from './interface/http/leave.controller.js';

@Module({
  imports: [IdentityModule, TenancyModule, WorkforceModule, SchedulingModule, NotificationsModule],
  controllers: [LeaveController],
  providers: [
    { provide: LeaveRequestRepository, useClass: DrizzleLeaveRequestRepository },
    { provide: HolidayRepository, useClass: DrizzleHolidayRepository },
    HolidaysService,
    LeaveService,
  ],
})
export class LeaveModule {}
