import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Permission } from '@xrostr/contracts';
import type { Request } from 'express';
import type { Principal } from '../../domain/principal.js';

export const PUBLIC_KEY = 'auth:public';
export const ALLOW_MFA_SETUP_KEY = 'auth:allow-mfa-setup';
export const PLATFORM_ONLY_KEY = 'auth:platform-only';
export const PERMISSIONS_KEY = 'auth:permissions';

/** No access token needed (login, refresh, invite acceptance, health). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Reachable with a restricted `mfa_setup` session, so the user can enrol in 2FA. */
export const AllowMfaSetup = () => SetMetadata(ALLOW_MFA_SETUP_KEY, true);

/** Only platform superadmins. */
export const PlatformOnly = () => SetMetadata(PLATFORM_ONLY_KEY, true);

/** Only tenant users holding every listed permission. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export type AuthenticatedRequest = Request & { principal: Principal };

export const CurrentPrincipal = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Principal =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().principal,
);
