import { Injectable } from '@nestjs/common';
import type {
  LegalEntityInput,
  ReissuedAdminInvite,
  TenantDetail,
  UpdateTenantRequest,
} from '@xrostr/contracts';
import { AuditLogger, UnitOfWork } from '../../../shared/application/ports.js';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import { TenantUserAccess, type Principal } from '../../identity/public-api.js';
import { TenantRepository } from './ports.js';

const TenancyErrors = {
  notFound: () => new DomainError('not_found', 'tenant_not_found', 'Tenant not found.'),
  duplicateEntity: () =>
    new DomainError('conflict', 'duplicate_legal_entity', 'Legal entity names must be unique.'),
  notAnAdmin: () =>
    new DomainError(
      'not_found',
      'tenant_admin_not_found',
      'This person is not an administrator of the tenant.',
    ),
};

/**
 * Superadmin changes to an existing tenant. Suspending a tenant signs all of its users out
 * and blocks sign-in until it is reactivated; its data is kept.
 */
@Injectable()
export class ManageTenantService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tenants: TenantRepository,
    private readonly users: TenantUserAccess,
    private readonly audit: AuditLogger,
  ) {}

  detail(id: string): Promise<Result<TenantDetail>> {
    return this.uow.runInPlatform(async () => {
      const tenant = await this.tenants.findById(id);
      if (!tenant) return err(TenancyErrors.notFound());
      return this.uow.runInTenant(id, async () =>
        ok({
          ...tenant,
          legalEntities: await this.tenants.listLegalEntities(),
          admins: (await this.users.admins()).map((a) => ({
            userId: a.id,
            email: a.email,
            fullName: a.fullName,
            status: a.status,
          })),
        }),
      );
    });
  }

  update(
    actor: Principal,
    id: string,
    changes: UpdateTenantRequest,
    ip: string | null,
  ): Promise<Result<TenantDetail>> {
    return this.uow.runInPlatform(async () => {
      const tenant = await this.tenants.findById(id);
      if (!tenant) return err(TenancyErrors.notFound());
      await this.tenants.update(id, changes);
      if (changes.status === 'suspended' && tenant.status !== 'suspended') {
        await this.users.signOutEveryone(id);
      }
      const action =
        changes.status && changes.status !== tenant.status
          ? changes.status === 'suspended'
            ? 'tenant.suspended'
            : 'tenant.reactivated'
          : 'tenant.updated';
      await this.record(actor, action, id, { ...changes }, ip);
      return this.detail(id);
    });
  }

  addLegalEntity(
    actor: Principal,
    id: string,
    input: LegalEntityInput,
    ip: string | null,
  ): Promise<Result<TenantDetail>> {
    return this.uow.runInPlatform(async () => {
      if (!(await this.tenants.findById(id))) return err(TenancyErrors.notFound());
      const added = await this.uow.runInTenant(id, async () => {
        const existing = await this.tenants.listLegalEntities();
        if (existing.some((e) => e.name.toLowerCase() === input.name.toLowerCase())) return false;
        await this.tenants.insertLegalEntities([
          {
            name: input.name,
            countryCode: input.countryCode,
            registrationNumber: input.registrationNumber ?? null,
          },
        ]);
        return true;
      });
      if (!added) return err(TenancyErrors.duplicateEntity());
      await this.record(
        actor,
        'tenant.legal_entity_added',
        id,
        { name: input.name, countryCode: input.countryCode },
        ip,
      );
      return this.detail(id);
    });
  }

  reissueAdminInvite(
    actor: Principal,
    id: string,
    userId: string,
    ip: string | null,
  ): Promise<Result<ReissuedAdminInvite>> {
    return this.uow.runInPlatform(async () => {
      if (!(await this.tenants.findById(id))) return err(TenancyErrors.notFound());
      const issued = await this.uow.runInTenant(id, async () => {
        if (!(await this.users.admins()).some((a) => a.id === userId))
          return err(TenancyErrors.notAnAdmin());
        return this.users.reissueInvite(id, userId);
      });
      if (!issued.ok) return issued;
      await this.record(actor, 'tenant.admin_invite_reissued', id, { userId }, ip);
      return ok({
        inviteToken: issued.value.inviteToken,
        inviteExpiresAt: issued.value.inviteExpiresAt.toISOString(),
      });
    });
  }

  private record(
    actor: Principal,
    action: string,
    tenantId: string,
    metadata: Record<string, unknown>,
    ip: string | null,
  ) {
    return this.audit.recordPlatform({
      actorType: 'platform_admin',
      actorId: actor.subject.id,
      tenantId,
      action,
      targetType: 'tenant',
      targetId: tenantId,
      metadata,
      ip,
    });
  }
}
