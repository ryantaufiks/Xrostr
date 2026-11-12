import { Injectable } from '@nestjs/common';
import type { MfaSetupResponse, TokenPair } from '@inroster/contracts';
import { Clock, SecretCipher } from '../../../shared/application/ports.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import { IdentityErrors } from '../domain/identity-errors.js';
import type { Principal } from '../domain/principal.js';
import { AccountRepository, SessionRepository, TotpService } from './ports.js';
import { SessionIssuer, type ClientContext } from './session-issuer.js';
import { SubjectScope } from './subject-scope.js';

/** Step 1 of TOTP enrolment: store an encrypted pending secret and return it once. */
@Injectable()
export class StartMfaSetupUseCase {
  constructor(
    private readonly scope: SubjectScope,
    private readonly accounts: AccountRepository,
    private readonly totp: TotpService,
    private readonly cipher: SecretCipher,
  ) {}

  execute(principal: Principal): Promise<Result<MfaSetupResponse>> {
    return this.scope.run(principal.subject, async () => {
      const account = await this.accounts.findByRef(principal.subject);
      if (!account) return err(IdentityErrors.invalidRefreshToken());
      if (account.mfaEnabled) return err(IdentityErrors.mfaAlreadyEnabled());

      const secret = this.totp.generateSecret();
      await this.accounts.setPendingMfaSecret(account.ref, this.cipher.encrypt(secret));
      await this.scope.record(account.ref, { action: 'auth.mfa_setup_started' });
      return ok({ secret, otpauthUrl: this.totp.buildUri(secret, account.email) });
    });
  }
}

/**
 * Step 2: a valid code switches 2FA on. The restricted session is revoked and a
 * full session is issued in its place.
 */
@Injectable()
export class ConfirmMfaSetupUseCase {
  constructor(
    private readonly scope: SubjectScope,
    private readonly accounts: AccountRepository,
    private readonly sessions: SessionRepository,
    private readonly totp: TotpService,
    private readonly cipher: SecretCipher,
    private readonly issuer: SessionIssuer,
    private readonly clock: Clock,
  ) {}

  execute(principal: Principal, code: string, client: ClientContext): Promise<Result<TokenPair>> {
    return this.scope.run(principal.subject, async () => {
      const account = await this.accounts.findByRef(principal.subject);
      if (!account) return err(IdentityErrors.invalidRefreshToken());
      if (account.mfaEnabled) return err(IdentityErrors.mfaAlreadyEnabled());
      if (!account.mfaSecretEnc) return err(IdentityErrors.mfaSetupNotStarted());
      if (!this.totp.verify(this.cipher.decrypt(account.mfaSecretEnc), code)) {
        return err(IdentityErrors.invalidMfaCode());
      }

      const now = this.clock.now();
      await this.accounts.enableMfa(account.ref, now);
      const current = await this.sessions.findById(principal.sessionId);
      if (current) await this.sessions.revokeFamily(current.familyId, now);

      const { sessionId, ...tokens } = await this.issuer.issue(
        { ...account, mfaEnabled: true },
        client,
      );
      await this.scope.record(account.ref, {
        action: 'auth.mfa_enabled',
        targetType: 'session',
        targetId: sessionId,
        ip: client.ip,
      });
      return ok(tokens);
    });
  }
}
