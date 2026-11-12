import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WorkforceModule } from '../workforce/workforce.module.js';
import { ShiftRepository } from './application/ports.js';
import { SchedulingService } from './application/scheduling.service.js';
import { DrizzleShiftRepository } from './infrastructure/drizzle-shift.repository.js';
import { SchedulingController } from './interface/http/scheduling.controller.js';

@Module({
  imports: [WorkforceModule, NotificationsModule],
  controllers: [SchedulingController],
  providers: [{ provide: ShiftRepository, useClass: DrizzleShiftRepository }, SchedulingService],
})
export class SchedulingModule {}
