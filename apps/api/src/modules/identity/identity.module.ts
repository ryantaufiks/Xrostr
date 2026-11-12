import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { APP_CONFIG, type AppConfig } from '../../shared/config/app-config.js';
import { AcceptInviteUseCase } from './application/accept-invite.use-case.js';
import { ChangePasswordUseCase } from './application/change-password.use-case.js';
import { LoginUseCase } from './application/login.use-case.js';
import { LogoutUseCase } from './application/logout.use-case.js';
import { ConfirmMfaSetupUseCase, StartMfaSetupUseCase } from './application/mfa.use-cases.js';
import {
  AccessTokenService,
  AccountRepository,
  IdentitySettings,
  InviteRepository,
  OpaqueTokens,
  PasswordHasher,
  RoleRepository,
  SessionRepository,
  TotpService,
} from './application/ports.js';
import { RefreshSessionUseCase } from './application/refresh-session.use-case.js';
import { SessionIssuer } from './application/session-issuer.js';
import { SubjectScope } from './application/subject-scope.js';
import { TenantIdentityProvisioner } from './application/tenant-identity-provisioner.js';
import { TenantUserAccess } from './application/tenant-user-access.js';
import {
  Argon2PasswordHasher,
  CryptoOpaqueTokens,
  OtpauthTotpService,
} from './infrastructure/crypto-adapters.js';
import { DrizzleAccountRepository } from './infrastructure/drizzle-account.repository.js';
import {
  DrizzleInviteRepository,
  DrizzleRoleRepository,
  DrizzleSessionRepository,
} from './infrastructure/drizzle-identity.repositories.js';
import { JoseAccessTokenService } from './infrastructure/jose-access-token.service.js';
import { AuthController } from './interface/http/auth.controller.js';
import { AuthGuard } from './interface/http/auth.guard.js';

@Module({
  controllers: [AuthController],
  providers: [
    // Adapters
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
    { provide: TotpService, useClass: OtpauthTotpService },
    { provide: OpaqueTokens, useClass: CryptoOpaqueTokens },
    {
      provide: AccessTokenService,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) =>
        new JoseAccessTokenService(c.jwt.secret, c.jwt.issuer, c.jwt.accessTtlSeconds),
    },
    {
      provide: IdentitySettings,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig): IdentitySettings => ({
        accessTokenTtlSeconds: c.jwt.accessTtlSeconds,
        refreshTokenTtlSeconds: c.jwt.refreshTtlSeconds,
      }),
    },
    { provide: AccountRepository, useClass: DrizzleAccountRepository },
    { provide: RoleRepository, useClass: DrizzleRoleRepository },
    { provide: InviteRepository, useClass: DrizzleInviteRepository },
    { provide: SessionRepository, useClass: DrizzleSessionRepository },
    // Application
    SubjectScope,
    SessionIssuer,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    AcceptInviteUseCase,
    StartMfaSetupUseCase,
    ConfirmMfaSetupUseCase,
    ChangePasswordUseCase,
    TenantIdentityProvisioner,
    TenantUserAccess,
    // Every route is authenticated unless marked @Public.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [TenantIdentityProvisioner, TenantUserAccess],
})
export class IdentityModule {}
