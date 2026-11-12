import { Injectable } from '@nestjs/common';
import { SYSTEM_ROLE_DEFINITIONS } from '@xrostr/contracts';
import { RoleRepository } from './ports.js';
import { TenantUserAccess, type IssuedInvite } from './tenant-user-access.js';

export type ProvisionedAdmin = IssuedInvite;

/**
 * Public API of the identity module for onboarding: creates the built-in roles and
 * invites the first Tenant Admin. Must run inside the new tenant's unit of work.
 */
@Injectable()
export class TenantIdentityProvisioner {
  constructor(
    private readonly roles: RoleRepository,
    private readonly access: TenantUserAccess,
  ) {}

  async provision(
    tenantId: string,
    admin: { email: string; fullName: string },
  ): Promise<ProvisionedAdmin> {
    await this.roles.insertSystemRoles(SYSTEM_ROLE_DEFINITIONS);
    const invited = await this.access.invite(tenantId, { ...admin, role: 'tenant_admin' });
    // A brand-new tenant has no users, so the email cannot be taken.
    if (!invited.ok) throw new Error(invited.error.message);
    return invited.value;
  }
}
