import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { TenantRepository } from './application/ports.js';
import {
  CreateTenantUseCase,
  ListLegalEntitiesUseCase,
  ListTenantsUseCase,
} from './application/tenancy.use-cases.js';
import { DrizzleTenantRepository } from './infrastructure/drizzle-tenant.repository.js';
import {
  LegalEntitiesController,
  PlatformTenantsController,
} from './interface/http/tenancy.controllers.js';

@Module({
  imports: [IdentityModule],
  controllers: [PlatformTenantsController, LegalEntitiesController],
  providers: [
    { provide: TenantRepository, useClass: DrizzleTenantRepository },
    CreateTenantUseCase,
    ListTenantsUseCase,
    ListLegalEntitiesUseCase,
  ],
})
export class TenancyModule {}
