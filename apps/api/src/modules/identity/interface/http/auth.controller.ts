import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  acceptInviteRequestSchema,
  changePasswordRequestSchema,
  enableMfaRequestSchema,
  loginRequestSchema,
  platformLoginRequestSchema,
  refreshRequestSchema,
  type AcceptInviteRequest,
  type ChangePasswordRequest,
  type EnableMfaRequest,
  type LoginRequest,
  type MfaSetupResponse,
  type PlatformLoginRequest,
  type RefreshRequest,
  type TokenPair,
} from '@xrostr/contracts';
import {
  Client,
  type ClientInfo,
} from '../../../../shared/interface/http/client-info.decorator.js';
import { unwrap } from '../../../../shared/interface/http/domain-error.exception.js';
import { ZodValidationPipe } from '../../../../shared/interface/http/zod-validation.pipe.js';
import { AcceptInviteUseCase } from '../../application/accept-invite.use-case.js';
import { ChangePasswordUseCase } from '../../application/change-password.use-case.js';
import { LoginUseCase } from '../../application/login.use-case.js';
import { LogoutUseCase } from '../../application/logout.use-case.js';
import { ConfirmMfaSetupUseCase, StartMfaSetupUseCase } from '../../application/mfa.use-cases.js';
import { RefreshSessionUseCase } from '../../application/refresh-session.use-case.js';
import type { Principal } from '../../domain/principal.js';
import { AllowMfaSetup, CurrentPrincipal, Public } from './auth.decorators.js';

/** Stricter limit for credential endpoints: 10 attempts per minute per client. */
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller()
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly refresh: RefreshSessionUseCase,
    private readonly logout: LogoutUseCase,
    private readonly acceptInvite: AcceptInviteUseCase,
    private readonly startMfa: StartMfaSetupUseCase,
    private readonly confirmMfa: ConfirmMfaSetupUseCase,
    private readonly changePassword: ChangePasswordUseCase,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('auth/login')
  @HttpCode(200)
  async loginUser(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Client() client: ClientInfo,
  ): Promise<TokenPair> {
    return unwrap(await this.login.loginTenantUser(body, client));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('platform/auth/login')
  @HttpCode(200)
  async loginPlatform(
    @Body(new ZodValidationPipe(platformLoginRequestSchema)) body: PlatformLoginRequest,
    @Client() client: ClientInfo,
  ): Promise<TokenPair> {
    return unwrap(await this.login.loginPlatformAdmin(body, client));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('auth/refresh')
  @HttpCode(200)
  async refreshSession(
    @Body(new ZodValidationPipe(refreshRequestSchema)) body: RefreshRequest,
    @Client() client: ClientInfo,
  ): Promise<TokenPair> {
    return unwrap(await this.refresh.execute(body.refreshToken, client));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('auth/accept-invite')
  @HttpCode(200)
  async accept(
    @Body(new ZodValidationPipe(acceptInviteRequestSchema)) body: AcceptInviteRequest,
  ): Promise<{ userId: string }> {
    return unwrap(await this.acceptInvite.execute(body));
  }

  @AllowMfaSetup()
  @Post('auth/logout')
  @HttpCode(204)
  async signOut(@CurrentPrincipal() principal: Principal): Promise<void> {
    await this.logout.execute(principal);
  }

  @AllowMfaSetup()
  @Get('auth/me')
  me(@CurrentPrincipal() principal: Principal): Principal {
    return principal;
  }

  @AllowMfaSetup()
  @Post('auth/mfa/setup')
  @HttpCode(200)
  async mfaSetup(@CurrentPrincipal() principal: Principal): Promise<MfaSetupResponse> {
    return unwrap(await this.startMfa.execute(principal));
  }

  @AllowMfaSetup()
  @Throttle(AUTH_THROTTLE)
  @Post('auth/mfa/enable')
  @HttpCode(200)
  async mfaEnable(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(enableMfaRequestSchema)) body: EnableMfaRequest,
    @Client() client: ClientInfo,
  ): Promise<TokenPair> {
    return unwrap(await this.confirmMfa.execute(principal, body.code, client));
  }

  /** Requires a full session: users enrol in 2FA before they can change the password. */
  @Throttle(AUTH_THROTTLE)
  @Post('auth/change-password')
  @HttpCode(200)
  async changeOwnPassword(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
    @Client() client: ClientInfo,
  ): Promise<TokenPair> {
    return unwrap(await this.changePassword.execute(principal, body, client));
  }
}
