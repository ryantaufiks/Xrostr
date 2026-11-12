import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { TenancyModule } from '../tenancy/tenancy.module.js';
import { EmployeesService } from './application/employees.service.js';
import { LocationsService } from './application/locations.service.js';
import { WorkforceDirectory } from './application/workforce-directory.js';
import { EmployeeRepository, LocationRepository } from './application/ports.js';
import {
  DrizzleEmployeeRepository,
  DrizzleLocationRepository,
} from './infrastructure/drizzle-workforce.repositories.js';
import {
  EmployeesController,
  LocationsController,
} from './interface/http/workforce.controllers.js';

@Module({
  imports: [IdentityModule, TenancyModule],
  controllers: [LocationsController, EmployeesController],
  providers: [
    { provide: LocationRepository, useClass: DrizzleLocationRepository },
    { provide: EmployeeRepository, useClass: DrizzleEmployeeRepository },
    LocationsService,
    EmployeesService,
    WorkforceDirectory,
  ],
  exports: [WorkforceDirectory],
})
export class WorkforceModule {}
