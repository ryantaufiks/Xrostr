import { Injectable } from '@nestjs/common';
import type { SystemRole } from '@xrostr/contracts';
import { Clock } from '../../../shared/application/ports.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import { IdentityErrors } from '../domain/identity-errors.js';
import {
  AccountRepository,
  InviteRepository,
  OpaqueTokens,
  RoleRepository,
  SessionRepository,
  type UserSummary,
} from './ports.js';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;

export interface IssuedInvite {
  userId: string;
  inviteToken: string;
  inviteExpiresAt: Date;
}

/**
 * Public API of the identity module for managing a tenant's people: invite with a role,
 * re-issue an invite, switch access on or off, and read account summaries.
 * Every method must run inside the tenant's unit of work.
 */
@Injectable()
export class TenantUserAccess {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly roles: RoleRepository,
    private readonly invites: InviteRepository,
    private readonly sessions: SessionRepository,
    private readonly opaque: OpaqueTokens,
    private readonly clock: Clock,
  ) {}

  async invite(
    tenantId: string,
    person: { email: string; fullName: string; role: SystemRole },
  ): Promise<Result<IssuedInvite>> {
    if (await this.accounts.findTenantUserByEmail(person.email))
      return err(IdentityErrors.emailTaken());
    const roleId = await this.roles.findIdByKey(person.role);
    if (!roleId) throw new Error(`System role ${person.role} is missing for tenant ${tenantId}`);

    const userId = await this.accounts.insertInvitedUser(person.email, person.fullName);
    await this.roles.assign(userId, roleId);
    return ok(await this.issueInvite(tenantId, userId));
  }

  /** A fresh link for someone who has not activated yet; older links stop working. */
  async reissueInvite(tenantId: string, userId: string): Promise<Result<IssuedInvite>> {
    const account = await this.accounts.findByRef({ type: 'user', id: userId, tenantId });
    if (!account) return err(IdentityErrors.userNotFound());
    if (account.status !== 'invited') return err(IdentityErrors.userAlreadyActive());
    await this.invites.expireOpenForUser(userId, this.clock.now());
    return ok(await this.issueInvite(tenantId, userId));
  }

  /**
   * Turning access off signs the person out everywhere and blocks sign-in; turning it back on
   * restores whatever state the account had reached (invited people stay invited).
   */
  async setAccess(tenantId: string, userId: string, enabled: boolean): Promise<void> {
    const ref = { type: 'user' as const, id: userId, tenantId };
    const account = await this.accounts.findByRef(ref);
    if (!account) return;
    const now = this.clock.now();
    if (!enabled) {
      await this.accounts.setUserStatus(userId, 'disabled');
      await this.invites.expireOpenForUser(userId, now);
      await this.sessions.revokeAllForSubject(ref, now);
    } else if (account.status === 'disabled') {
      await this.accounts.setUserStatus(userId, account.passwordHash ? 'active' : 'invited');
    }
  }

  summarize(userIds: readonly string[]): Promise<Map<string, UserSummary>> {
    return this.accounts.summarize(userIds);
  }

  private async issueInvite(tenantId: string, userId: string): Promise<IssuedInvite> {
    const { token, hash } = this.opaque.generate();
    const inviteExpiresAt = new Date(this.clock.now().getTime() + INVITE_TTL_MS);
    await this.invites.insert(userId, hash, inviteExpiresAt);
    return { userId, inviteToken: `${tenantId}.${token}`, inviteExpiresAt };
  }
}
