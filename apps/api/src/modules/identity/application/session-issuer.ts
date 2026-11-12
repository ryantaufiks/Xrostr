import { Injectable } from '@nestjs/common';
import type { TokenPair } from '@inroster/contracts';
import { v7 as uuidv7 } from 'uuid';
import { Clock } from '../../../shared/application/ports.js';
import { resolveStage, type Account } from '../domain/account.js';
import { AccessTokenService, IdentitySettings, OpaqueTokens, SessionRepository } from './ports.js';

export interface ClientContext {
  ip: string | null;
  userAgent: string | null;
}

/** Creates a refresh-token session and the matching access token. Call inside a unit of work. */
@Injectable()
export class SessionIssuer {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly accessTokens: AccessTokenService,
    private readonly opaque: OpaqueTokens,
    private readonly settings: IdentitySettings,
    private readonly clock: Clock,
  ) {}

  async issue(
    account: Account,
    client: ClientContext,
    familyId: string = uuidv7(),
  ): Promise<TokenPair & { sessionId: string }> {
    const stage = resolveStage(account);
    const { token, hash } = this.opaque.generate();
    const now = this.clock.now();
    const sessionId = await this.sessions.insert({
      subject: account.ref,
      familyId,
      tokenHash: hash,
      stage,
      expiresAt: new Date(now.getTime() + this.settings.refreshTokenTtlSeconds * 1000),
      userAgent: client.userAgent,
      ip: client.ip,
    });
    const accessToken = await this.accessTokens.sign({
      subjectType: account.ref.type,
      subjectId: account.ref.id,
      tenantId: account.ref.tenantId,
      sessionId,
      stage,
      // A restricted session carries no permissions at all.
      permissions: stage === 'full' ? account.permissions : [],
    });
    return {
      sessionId,
      accessToken,
      refreshToken: `${sessionId}.${token}`,
      expiresIn: this.settings.accessTokenTtlSeconds,
      stage,
    };
  }
}
