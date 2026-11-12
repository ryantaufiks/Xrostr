import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TenancyModule } from '../tenancy/tenancy.module.js';
import { WorkforceModule } from '../workforce/workforce.module.js';
import { AttendanceService } from './application/attendance.service.js';
import {
  AttendanceRepository,
  LeaveCalendarRepository,
  ShiftRepository,
  StaffingRepository,
  ZoneRepository,
} from './application/ports.js';
import { SchedulingDirectory } from './application/scheduling-directory.js';
import { SchedulingService } from './application/scheduling.service.js';
import { ZonesService } from './application/zones.service.js';
import { DrizzleAttendanceRepository } from './infrastructure/drizzle-attendance.repository.js';
import { DrizzleLeaveCalendarRepository } from './infrastructure/drizzle-leave-calendar.repository.js';
import { DrizzleShiftRepository } from './infrastructure/drizzle-shift.repository.js';
import { DrizzleStaffingRepository } from './infrastructure/drizzle-staffing.repository.js';
import { DrizzleZoneRepository } from './infrastructure/drizzle-zone.repository.js';
import { SchedulingController } from './interface/http/scheduling.controller.js';
import { ZonesController } from './interface/http/zones.controller.js';

@Module({
  imports: [WorkforceModule, TenancyModule, NotificationsModule],
  controllers: [SchedulingController, ZonesController],
  providers: [
    { provide: ShiftRepository, useClass: DrizzleShiftRepository },
    { provide: AttendanceRepository, useClass: DrizzleAttendanceRepository },
    { provide: StaffingRepository, useClass: DrizzleStaffingRepository },
    { provide: LeaveCalendarRepository, useClass: DrizzleLeaveCalendarRepository },
    { provide: ZoneRepository, useClass: DrizzleZoneRepository },
    SchedulingService,
    AttendanceService,
    SchedulingDirectory,
    ZonesService,
  ],
  exports: [SchedulingDirectory],
})
export class SchedulingModule {}
