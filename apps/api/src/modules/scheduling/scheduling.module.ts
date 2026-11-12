import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WorkforceModule } from '../workforce/workforce.module.js';
import { AttendanceService } from './application/attendance.service.js';
import { AttendanceRepository, ShiftRepository } from './application/ports.js';
import { SchedulingDirectory } from './application/scheduling-directory.js';
import { SchedulingService } from './application/scheduling.service.js';
import { DrizzleAttendanceRepository } from './infrastructure/drizzle-attendance.repository.js';
import { DrizzleShiftRepository } from './infrastructure/drizzle-shift.repository.js';
import { SchedulingController } from './interface/http/scheduling.controller.js';

@Module({
  imports: [WorkforceModule, NotificationsModule],
  controllers: [SchedulingController],
  providers: [
    { provide: ShiftRepository, useClass: DrizzleShiftRepository },
    { provide: AttendanceRepository, useClass: DrizzleAttendanceRepository },
    SchedulingService,
    AttendanceService,
    SchedulingDirectory,
  ],
  exports: [SchedulingDirectory],
})
export class SchedulingModule {}
