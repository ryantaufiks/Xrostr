import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TenancyModule } from '../tenancy/tenancy.module.js';
import { WorkforceModule } from '../workforce/workforce.module.js';
import { AttendanceService } from './application/attendance.service.js';
import {
  AttendanceRepository,
  LeaveCalendarRepository,
  ReliefRepository,
  ShiftRepository,
  StaffingRepository,
  VisitRepository,
  ZoneRepository,
} from './application/ports.js';
import { PlanningService } from './application/planning.service.js';
import { ReliefService } from './application/relief.service.js';
import { RovingVisitsService } from './application/roving-visits.service.js';
import { SchedulingDirectory } from './application/scheduling-directory.js';
import { SchedulingService } from './application/scheduling.service.js';
import { ZonesService } from './application/zones.service.js';
import { DrizzleAttendanceRepository } from './infrastructure/drizzle-attendance.repository.js';
import { DrizzleLeaveCalendarRepository } from './infrastructure/drizzle-leave-calendar.repository.js';
import { DrizzleReliefRepository } from './infrastructure/drizzle-relief.repository.js';
import { DrizzleShiftRepository } from './infrastructure/drizzle-shift.repository.js';
import { DrizzleStaffingRepository } from './infrastructure/drizzle-staffing.repository.js';
import { DrizzleVisitRepository } from './infrastructure/drizzle-visit.repository.js';
import { DrizzleZoneRepository } from './infrastructure/drizzle-zone.repository.js';
import { PlanningController } from './interface/http/planning.controller.js';
import { SchedulingController } from './interface/http/scheduling.controller.js';
import { ReliefController } from './interface/http/relief.controller.js';
import { ZonesController } from './interface/http/zones.controller.js';

@Module({
  imports: [WorkforceModule, TenancyModule, NotificationsModule],
  controllers: [SchedulingController, ZonesController, ReliefController, PlanningController],
  providers: [
    { provide: ShiftRepository, useClass: DrizzleShiftRepository },
    { provide: AttendanceRepository, useClass: DrizzleAttendanceRepository },
    { provide: StaffingRepository, useClass: DrizzleStaffingRepository },
    { provide: LeaveCalendarRepository, useClass: DrizzleLeaveCalendarRepository },
    { provide: ZoneRepository, useClass: DrizzleZoneRepository },
    { provide: ReliefRepository, useClass: DrizzleReliefRepository },
    { provide: VisitRepository, useClass: DrizzleVisitRepository },
    SchedulingService,
    AttendanceService,
    SchedulingDirectory,
    ZonesService,
    ReliefService,
    RovingVisitsService,
    PlanningService,
  ],
  exports: [SchedulingDirectory],
})
export class SchedulingModule {}
