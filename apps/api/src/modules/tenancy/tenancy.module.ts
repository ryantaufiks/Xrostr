import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { LegalEntityDirectory } from './application/legal-entity-directory.js';
import { TenantRepository } from './application/ports.js';
import {
  CreateTenantUseCase,
  GetTenantProfileUseCase,
  ListLegalEntitiesUseCase,
  ListTenantsUseCase,
} from './application/tenancy.use-cases.js';
import { DrizzleTenantRepository } from './infrastructure/drizzle-tenant.repository.js';
import {
  LegalEntitiesController,
  PlatformTenantsController,
  TenantProfileController,
} from './interface/http/tenancy.controllers.js';

@Module({
  imports: [IdentityModule],
  controllers: [PlatformTenantsController, LegalEntitiesController, TenantProfileController],
  providers: [
    { provide: TenantRepository, useClass: DrizzleTenantRepository },
    CreateTenantUseCase,
    ListTenantsUseCase,
    ListLegalEntitiesUseCase,
    GetTenantProfileUseCase,
    LegalEntityDirectory,
  ],
  exports: [LegalEntityDirectory],
})
export class TenancyModule {}
