import { Module } from '@nestjs/common';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { WorkforceModule } from '../workforce/workforce.module.js';
import { PatrolRoutesService } from './application/patrol-routes.service.js';
import { PatrolService } from './application/patrol.service.js';
import { PatrolRoundRepository, PatrolRouteRepository } from './application/ports.js';
import {
  DrizzlePatrolRoundRepository,
  DrizzlePatrolRouteRepository,
} from './infrastructure/drizzle-patrol.repositories.js';
import { PatrolController } from './interface/http/patrol.controller.js';

@Module({
  imports: [WorkforceModule, SchedulingModule],
  controllers: [PatrolController],
  providers: [
    { provide: PatrolRouteRepository, useClass: DrizzlePatrolRouteRepository },
    { provide: PatrolRoundRepository, useClass: DrizzlePatrolRoundRepository },
    PatrolRoutesService,
    PatrolService,
  ],
})
export class PatrolModule {}
