import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  createTenantRequestSchema,
  legalEntityInputSchema,
  updateTenantSchema,
  type CreateTenantRequest,
  type LegalEntityInput,
  type ReissuedAdminInvite,
  type TenantDetail,
  type UpdateTenantRequest,
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
  TenantUser,
  type Principal,
} from '../../../identity/public-api.js';
import {
  CreateTenantUseCase,
  GetTenantProfileUseCase,
  ListLegalEntitiesUseCase,
  ListTenantsUseCase,
  type LegalEntityView,
} from '../../application/tenancy.use-cases.js';
import { ManageTenantService } from '../../application/manage-tenant.service.js';

@PlatformOnly()
@Controller('platform/tenants')
export class PlatformTenantsController {
  constructor(
    private readonly createTenant: CreateTenantUseCase,
    private readonly listTenants: ListTenantsUseCase,
    private readonly manage: ManageTenantService,
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

  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string): Promise<TenantDetail> {
    return unwrap(await this.manage.detail(id));
  }

  @Patch(':id')
  async update(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTenantSchema)) body: UpdateTenantRequest,
    @Client() client: ClientInfo,
  ): Promise<TenantDetail> {
    return unwrap(await this.manage.update(actor, id, body, client.ip));
  }

  @Post(':id/legal-entities')
  async addLegalEntity(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(legalEntityInputSchema)) body: LegalEntityInput,
    @Client() client: ClientInfo,
  ): Promise<TenantDetail> {
    return unwrap(await this.manage.addLegalEntity(actor, id, body, client.ip));
  }

  @Post(':id/admins/:userId/invite')
  @HttpCode(200)
  async reissueAdminInvite(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Client() client: ClientInfo,
  ): Promise<ReissuedAdminInvite> {
    return unwrap(await this.manage.reissueAdminInvite(actor, id, userId, client.ip));
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

@Controller('tenant/profile')
export class TenantProfileController {
  constructor(private readonly profile: GetTenantProfileUseCase) {}

  @TenantUser()
  @Get()
  get(@CurrentPrincipal() principal: Principal): Promise<{ name: string; slug: string }> {
    return this.profile.execute(principal.subject.tenantId!);
  }
}
