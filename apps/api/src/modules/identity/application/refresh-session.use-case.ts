import { Injectable } from '@nestjs/common';
import type { TokenPair } from '@xrostr/contracts';
import {
  AuditLogger,
  Clock,
  TenantDirectory,
  UnitOfWork,
} from '../../../shared/application/ports.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import { IdentityErrors } from '../domain/identity-errors.js';
import { AccountRepository, OpaqueTokens, SessionRepository } from './ports.js';
import { SessionIssuer, type ClientContext } from './session-issuer.js';
import { SubjectScope } from './subject-scope.js';
import { parseSessionToken } from './session-token.js';

/**
 * Rotates a refresh token. Presenting a token that was already rotated means it
 * leaked: the whole session family is revoked and the caller must sign in again.
 */
@Injectable()
export class RefreshSessionUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly sessions: SessionRepository,
    private readonly accounts: AccountRepository,
    private readonly opaque: OpaqueTokens,
    private readonly issuer: SessionIssuer,
    private readonly scope: SubjectScope,
    private readonly audit: AuditLogger,
    private readonly clock: Clock,
    private readonly tenants: TenantDirectory,
  ) {}

  execute(refreshToken: string, client: ClientContext): Promise<Result<TokenPair>> {
    const parsed = parseSessionToken(refreshToken);
    if (!parsed) return Promise.resolve(err(IdentityErrors.invalidRefreshToken()));

    return this.uow.runInPlatform(async () => {
      const now = this.clock.now();
      const session = await this.sessions.findById(parsed.sessionId);
      if (!session || !this.opaque.matches(parsed.secret, session.tokenHash)) {
        return err(IdentityErrors.invalidRefreshToken());
      }
      if (session.revokedAt) {
        if (session.replacedBy) {
          await this.sessions.revokeFamily(session.familyId, now);
          await this.audit.recordPlatform({
            actorType: session.subject.type,
            actorId: session.subject.id,
            tenantId: session.subject.tenantId,
            action: 'auth.refresh_token_reuse_detected',
            targetType: 'session_family',
            targetId: session.familyId,
            ip: client.ip,
          });
        }
        return err(IdentityErrors.invalidRefreshToken());
      }
      if (session.expiresAt <= now) return err(IdentityErrors.invalidRefreshToken());
      const tenantId = session.subject.tenantId;
      if (tenantId && !(await this.tenants.isActive(tenantId))) {
        await this.sessions.revokeFamily(session.familyId, now);
        return err(IdentityErrors.invalidRefreshToken());
      }

      return this.scope.run(session.subject, async () => {
        const account = await this.accounts.findByRef(session.subject);
        if (!account || account.status !== 'active') {
          await this.sessions.revokeFamily(session.familyId, now);
          return err(IdentityErrors.invalidRefreshToken());
        }
        // Permissions and stage are recomputed, so role changes apply on the next refresh.
        const { sessionId, ...tokens } = await this.issuer.issue(account, client, session.familyId);
        await this.sessions.markRotated(session.id, sessionId, now);
        return ok(tokens);
      });
    });
  }
}
