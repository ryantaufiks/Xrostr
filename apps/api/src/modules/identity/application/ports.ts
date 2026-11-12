import type { Permission, SessionStage, SystemRoleDefinition } from '@xrostr/contracts';
import type {
  Account,
  AccountStatus,
  LoginAttemptState,
  SubjectRef,
  SubjectType,
} from '../domain/account.js';

export interface UserSummary {
  email: string;
  status: AccountStatus;
  roleKey: string | null;
}

export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  /** With a null hash it still spends the same time, then returns false (no user enumeration). */
  abstract verify(hash: string | null, password: string): Promise<boolean>;
}

export abstract class TotpService {
  abstract generateSecret(): string;
  abstract buildUri(secret: string, accountLabel: string): string;
  abstract verify(secret: string, code: string): boolean;
}

/** Random high-entropy tokens of which only a hash is stored. */
export abstract class OpaqueTokens {
  abstract generate(): { token: string; hash: string };
  abstract hash(token: string): string;
  abstract matches(token: string, hash: string): boolean;
}

export interface AccessClaims {
  subjectType: SubjectType;
  subjectId: string;
  tenantId: string | null;
  sessionId: string;
  stage: SessionStage;
  permissions: readonly Permission[];
}

export abstract class AccessTokenService {
  abstract sign(claims: AccessClaims): Promise<string>;
  /** Returns null for any invalid, expired or tampered token. */
  abstract verify(token: string): Promise<AccessClaims | null>;
}

export abstract class IdentitySettings {
  abstract readonly accessTokenTtlSeconds: number;
  abstract readonly refreshTokenTtlSeconds: number;
}

/** Loads and updates platform admins and tenant users behind one interface. */
export abstract class AccountRepository {
  abstract findPlatformAdminByEmail(email: string): Promise<Account | null>;
  /** Requires a tenant unit of work. */
  abstract findTenantUserByEmail(email: string): Promise<Account | null>;
  abstract findByRef(ref: SubjectRef): Promise<Account | null>;
  abstract saveLoginAttempt(
    ref: SubjectRef,
    state: LoginAttemptState,
    succeededAt?: Date,
  ): Promise<void>;
  abstract setPendingMfaSecret(ref: SubjectRef, secretEnc: string): Promise<void>;
  abstract enableMfa(ref: SubjectRef, at: Date): Promise<void>;
  abstract setPassword(ref: SubjectRef, passwordHash: string): Promise<void>;
  /** Requires a tenant unit of work. */
  abstract insertInvitedUser(email: string, fullName: string): Promise<string>;
  /** Requires a tenant unit of work. */
  abstract activateUser(userId: string, passwordHash: string): Promise<void>;
  /** Requires a tenant unit of work. */
  abstract setUserStatus(userId: string, status: AccountStatus): Promise<void>;
  /** Email, status and role of tenant users, by id. Requires a tenant unit of work. */
  abstract summarize(userIds: readonly string[]): Promise<Map<string, UserSummary>>;
  /** The subject's personal language, or null when it follows the default. */
  abstract localeOf(ref: SubjectRef): Promise<string | null>;
  abstract setLocale(ref: SubjectRef, locale: string | null): Promise<void>;
  /** Users holding a role, any status. Requires a tenant unit of work. */
  abstract usersWithRole(
    roleKey: string,
  ): Promise<{ id: string; email: string; fullName: string; status: AccountStatus }[]>;
  /** Active users whose role grants the permission. Requires a tenant unit of work. */
  abstract activeUserIdsWithPermission(permission: string): Promise<string[]>;
}

export abstract class RoleRepository {
  /** Creates the built-in roles for the current tenant; returns role ids by key. */
  abstract insertSystemRoles(
    definitions: readonly SystemRoleDefinition[],
  ): Promise<Map<string, string>>;
  abstract assign(userId: string, roleId: string): Promise<void>;
  /** Requires a tenant unit of work. */
  abstract findIdByKey(key: string): Promise<string | null>;
}

export interface Invite {
  id: string;
  userId: string;
  expiresAt: Date;
  acceptedAt: Date | null;
}

export abstract class InviteRepository {
  abstract insert(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  abstract findByTokenHash(tokenHash: string): Promise<Invite | null>;
  abstract markAccepted(id: string, at: Date): Promise<void>;
  /** Expires every open invite of the user, so only the newest link works. */
  abstract expireOpenForUser(userId: string, at: Date): Promise<void>;
}

export interface Session {
  id: string;
  subject: SubjectRef;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: string | null;
}

export interface NewSession {
  subject: SubjectRef;
  familyId: string;
  tokenHash: string;
  stage: SessionStage;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
}

export abstract class SessionRepository {
  abstract insert(session: NewSession): Promise<string>;
  abstract findById(id: string): Promise<Session | null>;
  abstract markRotated(id: string, replacedBy: string, at: Date): Promise<void>;
  abstract revokeFamily(familyId: string, at: Date): Promise<void>;
  /** Signs the subject out everywhere. */
  abstract revokeAllForSubject(subject: SubjectRef, at: Date): Promise<void>;
  /** Signs every user of a tenant out, e.g. when the tenant is suspended. */
  abstract revokeAllForTenant(tenantId: string, at: Date): Promise<void>;
}
