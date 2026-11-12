import { Injectable } from '@nestjs/common';
import type { ChangePasswordRequest, TokenPair } from '@xrostr/contracts';
import { Clock } from '../../../shared/application/ports.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import { afterFailedAttempt, afterSuccessfulAttempt, isLocked } from '../domain/account.js';
import { IdentityErrors } from '../domain/identity-errors.js';
import type { Principal } from '../domain/principal.js';
import { AccountRepository, PasswordHasher, SessionRepository } from './ports.js';
import { SessionIssuer, type ClientContext } from './session-issuer.js';
import { SubjectScope } from './subject-scope.js';

/**
 * Replaces the caller's password after re-checking the current one. Every other session is
 * signed out and the caller gets a fresh one. Wrong guesses count towards the login lockout,
 * so a stolen session cannot be used to brute-force the password.
 */
@Injectable()
export class ChangePasswordUseCase {
  constructor(
    private readonly scope: SubjectScope,
    private readonly accounts: AccountRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: PasswordHasher,
    private readonly issuer: SessionIssuer,
    private readonly clock: Clock,
  ) {}

  execute(
    principal: Principal,
    input: ChangePasswordRequest,
    client: ClientContext,
  ): Promise<Result<TokenPair>> {
    return this.scope.run(principal.subject, async () => {
      const now = this.clock.now();
      const account = await this.accounts.findByRef(principal.subject);
      if (!account) return err(IdentityErrors.invalidRefreshToken());
      if (isLocked(account, now)) return err(IdentityErrors.accountLocked(account.lockedUntil!));

      if (!(await this.hasher.verify(account.passwordHash, input.currentPassword))) {
        const next = afterFailedAttempt(account, now);
        await this.accounts.saveLoginAttempt(account.ref, next);
        await this.scope.record(account.ref, {
          action: next.lockedUntil ? 'auth.account_locked' : 'auth.password_change_failed',
          ip: client.ip,
        });
        return err(IdentityErrors.invalidCurrentPassword());
      }

      await this.accounts.setPassword(account.ref, await this.hasher.hash(input.newPassword));
      await this.accounts.saveLoginAttempt(account.ref, afterSuccessfulAttempt());
      await this.sessions.revokeAllForSubject(account.ref, now);
      const { sessionId, ...tokens } = await this.issuer.issue(account, client);
      await this.scope.record(account.ref, {
        action: 'auth.password_changed',
        targetType: 'session',
        targetId: sessionId,
        ip: client.ip,
      });
      return ok(tokens);
    });
  }
}
