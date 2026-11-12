import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@xrostr/contracts';
import { DomainError } from '../../../../shared/domain/domain-error.js';
import { DomainErrorException } from '../../../../shared/interface/http/domain-error.exception.js';
import { AccessTokenService } from '../../application/ports.js';
import { hasPermissions, type Principal } from '../../domain/principal.js';
import {
  ALLOW_MFA_SETUP_KEY,
  PERMISSIONS_KEY,
  PLATFORM_ONLY_KEY,
  PUBLIC_KEY,
  type AuthenticatedRequest,
} from './auth.decorators.js';

const deny = (kind: 'unauthorized' | 'forbidden', code: string, message: string) =>
  new DomainErrorException(new DomainError(kind, code, message));

/**
 * Global guard: every route is authenticated unless marked @Public. Order of checks:
 * valid token, 2FA enrolment stage, platform-only routes, then tenant permissions.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const flag = <T>(key: string) =>
      this.reflector.getAllAndOverride<T>(key, [context.getHandler(), context.getClass()]);
    if (flag<boolean>(PUBLIC_KEY)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = await this.authenticate(request.get('authorization'));
    request.principal = principal;

    if (principal.stage === 'mfa_setup' && !flag<boolean>(ALLOW_MFA_SETUP_KEY)) {
      throw deny(
        'forbidden',
        'mfa_enrollment_required',
        'Set up two-factor authentication to continue.',
      );
    }
    const isPlatform = principal.subject.type === 'platform_admin';
    if (flag<boolean>(PLATFORM_ONLY_KEY) && !isPlatform) {
      throw deny(
        'forbidden',
        'platform_only',
        'This action is reserved for platform administrators.',
      );
    }
    const required = flag<Permission[]>(PERMISSIONS_KEY);
    if (required && (isPlatform || !hasPermissions(principal, required))) {
      throw deny('forbidden', 'missing_permission', 'You do not have permission to do this.');
    }
    return true;
  }

  private async authenticate(header: string | undefined): Promise<Principal> {
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const claims = token ? await this.tokens.verify(token) : null;
    if (!claims) throw deny('unauthorized', 'unauthenticated', 'Sign in to continue.');
    return {
      subject: { type: claims.subjectType, id: claims.subjectId, tenantId: claims.tenantId },
      sessionId: claims.sessionId,
      stage: claims.stage,
      permissions: claims.permissions,
    };
  }
}
