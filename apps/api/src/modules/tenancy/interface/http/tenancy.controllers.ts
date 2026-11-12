import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  createTenantRequestSchema,
  type CreateTenantRequest,
  type CreateTenantResponse,
  type TenantSummary,
} from '@xrostr/contracts';
import {
  Client,
  type ClientInfo,
} from '../../../../shared/interface/http/client-info.decorator.js';
import { unwrap } from '../../../../shared/interface/http/domain-error.exception.js';
import { ZodValidationPipe } from '../../../../shared/interface/http/zod-validation.pipe.js';
import {
  CurrentPrincipal,
  PlatformOnly,
  RequirePermissions,
  type Principal,
} from '../../../identity/public-api.js';
import {
  CreateTenantUseCase,
  ListLegalEntitiesUseCase,
  ListTenantsUseCase,
  type LegalEntityView,
} from '../../application/tenancy.use-cases.js';

@PlatformOnly()
@Controller('platform/tenants')
export class PlatformTenantsController {
  constructor(
    private readonly createTenant: CreateTenantUseCase,
    private readonly listTenants: ListTenantsUseCase,
  ) {}

  @Post()
  async create(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(createTenantRequestSchema)) body: CreateTenantRequest,
    @Client() client: ClientInfo,
  ): Promise<CreateTenantResponse> {
    return unwrap(await this.createTenant.execute(actor, body, client.ip));
  }

  @Get()
  list(): Promise<TenantSummary[]> {
    return this.listTenants.execute();
  }
}

@Controller('tenant/legal-entities')
export class LegalEntitiesController {
  constructor(private readonly listEntities: ListLegalEntitiesUseCase) {}

  @RequirePermissions('entities.read')
  @Get()
  list(@CurrentPrincipal() principal: Principal): Promise<LegalEntityView[]> {
    // RequirePermissions admits tenant users only, so tenantId is always set here.
    return this.listEntities.execute(principal.subject.tenantId!);
  }
}
