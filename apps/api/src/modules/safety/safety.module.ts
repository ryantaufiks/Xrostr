import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PatrolModule } from '../patrol/patrol.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { WorkforceModule } from '../workforce/workforce.module.js';
import { AlertRepository, WelfareCheckRepository } from './application/ports.js';
import { SafetyService } from './application/safety.service.js';
import {
  DrizzleAlertRepository,
  DrizzleWelfareCheckRepository,
} from './infrastructure/drizzle-safety.repositories.js';
import { SafetyController } from './interface/http/safety.controller.js';

@Module({
  imports: [IdentityModule, WorkforceModule, SchedulingModule, PatrolModule, NotificationsModule],
  controllers: [SafetyController],
  providers: [
    { provide: AlertRepository, useClass: DrizzleAlertRepository },
    { provide: WelfareCheckRepository, useClass: DrizzleWelfareCheckRepository },
    SafetyService,
  ],
})
export class SafetyModule {}
