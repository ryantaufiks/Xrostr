import { Injectable } from '@nestjs/common';
import type {
  CountryCode,
  CreateTenantRequest,
  CreateTenantResponse,
  TenantSummary,
} from '@xrostr/contracts';
import { AuditLogger, EventPublisher, UnitOfWork } from '../../../shared/application/ports.js';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import { TenantIdentityProvisioner, type Principal } from '../../identity/public-api.js';
import { draftTenant } from '../domain/tenant.js';
import { countryPack } from './country-packs.js';
import { TenantRepository } from './ports.js';

/**
 * Superadmin onboarding: tenant, legal entities, built-in roles and the first admin
 * invite are created in one transaction, so a tenant is never half-provisioned.
 */
@Injectable()
export class CreateTenantUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tenants: TenantRepository,
    private readonly identity: TenantIdentityProvisioner,
    private readonly audit: AuditLogger,
    private readonly events: EventPublisher,
  ) {}

  async execute(
    actor: Principal,
    input: CreateTenantRequest,
    ip: string | null,
  ): Promise<Result<CreateTenantResponse>> {
    const draft = draftTenant(input);
    if (!draft.ok) return draft;

    return this.uow.runInPlatform(async () => {
      if (await this.tenants.slugExists(draft.value.slug)) {
        return err(
          new DomainError(
            'conflict',
            'slug_taken',
            `The slug "${draft.value.slug}" is already in use.`,
          ),
        );
      }
      const tenantId = await this.tenants.insert(draft.value);
      const admin = await this.uow.runInTenant(tenantId, async () => {
        await this.tenants.insertLegalEntities(draft.value.legalEntities);
        return this.identity.provision(tenantId, input.firstAdmin);
      });

      await this.audit.recordPlatform({
        actorType: 'platform_admin',
        actorId: actor.subject.id,
        tenantId,
        action: 'tenant.created',
        targetType: 'tenant',
        targetId: tenantId,
        metadata: {
          slug: draft.value.slug,
          plan: draft.value.plan,
          dataRegion: draft.value.dataRegion,
        },
        ip,
      });
      await this.events.publish({
        type: 'tenant.created',
        tenantId,
        payload: { tenantId, slug: draft.value.slug, firstAdminUserId: admin.userId },
      });
      return ok({
        tenantId,
        firstAdminUserId: admin.userId,
        inviteToken: admin.inviteToken,
        inviteExpiresAt: admin.inviteExpiresAt.toISOString(),
      });
    });
  }
}

@Injectable()
export class ListTenantsUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tenants: TenantRepository,
  ) {}

  execute(): Promise<TenantSummary[]> {
    return this.uow.runInPlatform(() => this.tenants.list());
  }
}

export interface LegalEntityView {
  id: string;
  name: string;
  countryCode: CountryCode;
  registrationNumber: string | null;
  currency: string;
  defaultTimezone: string;
}

@Injectable()
export class ListLegalEntitiesUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tenants: TenantRepository,
  ) {}

  async execute(tenantId: string): Promise<LegalEntityView[]> {
    const entities = await this.uow.runInTenant(tenantId, () => this.tenants.listLegalEntities());
    return entities.map((e) => {
      const pack = countryPack(e.countryCode);
      return { ...e, currency: pack.currency, defaultTimezone: pack.defaultTimezone };
    });
  }
}
