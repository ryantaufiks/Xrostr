import { Injectable } from '@nestjs/common';
import { SYSTEM_ROLE_DEFINITIONS } from '@inroster/contracts';
import { Clock } from '../../../shared/application/ports.js';
import { AccountRepository, InviteRepository, OpaqueTokens, RoleRepository } from './ports.js';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;

export interface ProvisionedAdmin {
  userId: string;
  inviteToken: string;
  inviteExpiresAt: Date;
}

/**
 * Public API of the identity module for onboarding: creates the built-in roles and
 * invites the first Tenant Admin. Must run inside the new tenant's unit of work.
 */
@Injectable()
export class TenantIdentityProvisioner {
  constructor(
    private readonly roles: RoleRepository,
    private readonly accounts: AccountRepository,
    private readonly invites: InviteRepository,
    private readonly opaque: OpaqueTokens,
    private readonly clock: Clock,
  ) {}

  async provision(
    tenantId: string,
    admin: { email: string; fullName: string },
  ): Promise<ProvisionedAdmin> {
    const roleIds = await this.roles.insertSystemRoles(SYSTEM_ROLE_DEFINITIONS);
    const userId = await this.accounts.insertInvitedUser(admin.email, admin.fullName);
    await this.roles.assign(userId, roleIds.get('tenant_admin')!);

    const { token, hash } = this.opaque.generate();
    const inviteExpiresAt = new Date(this.clock.now().getTime() + INVITE_TTL_MS);
    await this.invites.insert(userId, hash, inviteExpiresAt);
    return { userId, inviteToken: `${tenantId}.${token}`, inviteExpiresAt };
  }
}
