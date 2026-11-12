import { Injectable } from '@nestjs/common';
import type { LoginRequest, PlatformLoginRequest, TokenPair } from '@xrostr/contracts';
import {
  Clock,
  SecretCipher,
  TenantDirectory,
  UnitOfWork,
} from '../../../shared/application/ports.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import {
  afterFailedAttempt,
  afterSuccessfulAttempt,
  isLocked,
  type Account,
} from '../domain/account.js';
import { IdentityErrors } from '../domain/identity-errors.js';
import { AccountRepository, PasswordHasher, TotpService } from './ports.js';
import { SessionIssuer, type ClientContext } from './session-issuer.js';
import { SubjectScope } from './subject-scope.js';

interface Credentials {
  password: string;
  totpCode?: string | undefined;
}

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tenants: TenantDirectory,
    private readonly accounts: AccountRepository,
    private readonly hasher: PasswordHasher,
    private readonly totp: TotpService,
    private readonly cipher: SecretCipher,
    private readonly issuer: SessionIssuer,
    private readonly scope: SubjectScope,
    private readonly clock: Clock,
  ) {}

  async loginTenantUser(input: LoginRequest, client: ClientContext): Promise<Result<TokenPair>> {
    const tenantId = await this.uow.runInPlatform(() =>
      this.tenants.findActiveIdBySlug(input.tenantSlug),
    );
    if (!tenantId) {
      await this.hasher.verify(null, input.password);
      return err(IdentityErrors.invalidCredentials());
    }
    return this.uow.runInTenant(tenantId, async () =>
      this.authenticate(await this.accounts.findTenantUserByEmail(input.email), input, client),
    );
  }

  async loginPlatformAdmin(
    input: PlatformLoginRequest,
    client: ClientContext,
  ): Promise<Result<TokenPair>> {
    return this.uow.runInPlatform(async () =>
      this.authenticate(await this.accounts.findPlatformAdminByEmail(input.email), input, client),
    );
  }

  /** Runs inside the account's unit of work; failure counters commit even when login fails. */
  private async authenticate(
    account: Account | null,
    credentials: Credentials,
    client: ClientContext,
  ): Promise<Result<TokenPair>> {
    const now = this.clock.now();
    if (!account) {
      await this.hasher.verify(null, credentials.password);
      return err(IdentityErrors.invalidCredentials());
    }
    if (isLocked(account, now)) return err(IdentityErrors.accountLocked(account.lockedUntil!));

    const passwordOk = await this.hasher.verify(account.passwordHash, credentials.password);
    if (!passwordOk || account.status !== 'active') {
      return this.reject(account, client, 'password');
    }

    if (account.mfaEnabled) {
      if (!credentials.totpCode) return err(IdentityErrors.mfaRequired());
      const secret = this.cipher.decrypt(account.mfaSecretEnc!);
      if (!this.totp.verify(secret, credentials.totpCode))
        return this.reject(account, client, 'mfa');
    }

    await this.accounts.saveLoginAttempt(account.ref, afterSuccessfulAttempt(), now);
    const { sessionId, ...tokens } = await this.issuer.issue(account, client);
    await this.scope.record(account.ref, {
      action: 'auth.login_succeeded',
      targetType: 'session',
      targetId: sessionId,
      metadata: { stage: tokens.stage },
      ip: client.ip,
    });
    return ok(tokens);
  }

  private async reject(
    account: Account,
    client: ClientContext,
    factor: 'password' | 'mfa',
  ): Promise<Result<never>> {
    const next = afterFailedAttempt(account, this.clock.now());
    await this.accounts.saveLoginAttempt(account.ref, next);
    await this.scope.record(account.ref, {
      action: next.lockedUntil ? 'auth.account_locked' : 'auth.login_failed',
      metadata: { factor },
      ip: client.ip,
    });
    return err(
      factor === 'mfa' ? IdentityErrors.invalidMfaCode() : IdentityErrors.invalidCredentials(),
    );
  }
}
