import { Injectable } from '@nestjs/common';
import type { AcceptInviteRequest } from '@xrostr/contracts';
import { AuditLogger, Clock, UnitOfWork } from '../../../shared/application/ports.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import { IdentityErrors } from '../domain/identity-errors.js';
import { AccountRepository, InviteRepository, OpaqueTokens, PasswordHasher } from './ports.js';
import { parseInviteToken } from './session-token.js';

/** An invited user sets a password; the account becomes active and can sign in. */
@Injectable()
export class AcceptInviteUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly invites: InviteRepository,
    private readonly accounts: AccountRepository,
    private readonly opaque: OpaqueTokens,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuditLogger,
    private readonly clock: Clock,
  ) {}

  async execute(input: AcceptInviteRequest): Promise<Result<{ userId: string }>> {
    const parsed = parseInviteToken(input.inviteToken);
    if (!parsed) return err(IdentityErrors.invalidInvite());
    const passwordHash = await this.hasher.hash(input.password);

    return this.uow.runInTenant(parsed.tenantId, async () => {
      const now = this.clock.now();
      const invite = await this.invites.findByTokenHash(this.opaque.hash(parsed.secret));
      if (!invite || invite.acceptedAt || invite.expiresAt <= now)
        return err(IdentityErrors.invalidInvite());

      await this.accounts.activateUser(invite.userId, passwordHash);
      await this.invites.markAccepted(invite.id, now);
      await this.audit.recordTenant({
        actorType: 'user',
        actorId: invite.userId,
        action: 'user.invite_accepted',
        targetType: 'user',
        targetId: invite.userId,
      });
      return ok({ userId: invite.userId });
    });
  }
}
