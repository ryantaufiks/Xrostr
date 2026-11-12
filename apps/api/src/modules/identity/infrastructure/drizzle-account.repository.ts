import { Injectable } from '@nestjs/common';
import { PERMISSIONS, type Permission } from '@xrostr/contracts';
import { platformAdmins, roles, userRoles, users } from '@xrostr/db';
import { eq } from 'drizzle-orm';
import { DatabaseContext } from '../../../shared/infrastructure/database/database-context.js';
import { AccountRepository } from '../application/ports.js';
import type { Account, AccountStatus, LoginAttemptState, SubjectRef } from '../domain/account.js';

type UserRow = typeof users.$inferSelect;
type AdminRow = typeof platformAdmins.$inferSelect;

@Injectable()
export class DrizzleAccountRepository extends AccountRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async findPlatformAdminByEmail(email: string): Promise<Account | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(platformAdmins)
      .where(eq(platformAdmins.email, email))
      .limit(1);
    return row ? toAdminAccount(row) : null;
  }

  async findTenantUserByEmail(email: string): Promise<Account | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row ? this.toUserAccount(row) : null;
  }

  async findByRef(ref: SubjectRef): Promise<Account | null> {
    if (ref.type === 'platform_admin') {
      const [row] = await this.ctx
        .executor()
        .select()
        .from(platformAdmins)
        .where(eq(platformAdmins.id, ref.id))
        .limit(1);
      return row ? toAdminAccount(row) : null;
    }
    const [row] = await this.ctx
      .executor()
      .select()
      .from(users)
      .where(eq(users.id, ref.id))
      .limit(1);
    return row ? this.toUserAccount(row) : null;
  }

  async saveLoginAttempt(
    ref: SubjectRef,
    state: LoginAttemptState,
    succeededAt?: Date,
  ): Promise<void> {
    const values = {
      failedLoginCount: state.failedLoginCount,
      lockedUntil: state.lockedUntil,
      ...(succeededAt && { lastLoginAt: succeededAt }),
    };
    await this.update(ref, values);
  }

  async setPendingMfaSecret(ref: SubjectRef, secretEnc: string): Promise<void> {
    await this.update(ref, { mfaSecretEnc: secretEnc, mfaEnabledAt: null });
  }

  async enableMfa(ref: SubjectRef, at: Date): Promise<void> {
    await this.update(ref, { mfaEnabledAt: at });
  }

  async setPassword(ref: SubjectRef, passwordHash: string): Promise<void> {
    await this.update(ref, { passwordHash });
  }

  async insertInvitedUser(email: string, fullName: string): Promise<string> {
    const [row] = await this.ctx
      .executor()
      .insert(users)
      .values({ tenantId: this.ctx.tenantId(), email, fullName, status: 'invited' })
      .returning({ id: users.id });
    return row!.id;
  }

  async activateUser(userId: string, passwordHash: string): Promise<void> {
    await this.ctx
      .executor()
      .update(users)
      .set({ passwordHash, status: 'active' })
      .where(eq(users.id, userId));
  }

  private async update(ref: SubjectRef, values: Partial<AdminRow & UserRow>): Promise<void> {
    const db = this.ctx.executor();
    if (ref.type === 'platform_admin') {
      await db.update(platformAdmins).set(values).where(eq(platformAdmins.id, ref.id));
    } else {
      await db.update(users).set(values).where(eq(users.id, ref.id));
    }
  }

  private async toUserAccount(row: UserRow): Promise<Account> {
    const grants = await this.ctx
      .executor()
      .select({ permissions: roles.permissions, mfaRequired: roles.mfaRequired })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, row.id));
    const permissions = new Set(grants.flatMap((g) => g.permissions));
    return {
      ref: { type: 'user', id: row.id, tenantId: row.tenantId },
      email: row.email,
      passwordHash: row.passwordHash,
      status: row.status as AccountStatus,
      mfaSecretEnc: row.mfaSecretEnc,
      mfaEnabled: row.mfaEnabledAt !== null,
      mfaRequired: grants.some((g) => g.mfaRequired),
      // Unknown strings in the database never become permissions.
      permissions: PERMISSIONS.filter((p): p is Permission => permissions.has(p)),
      failedLoginCount: row.failedLoginCount,
      lockedUntil: row.lockedUntil,
    };
  }
}

function toAdminAccount(row: AdminRow): Account {
  return {
    ref: { type: 'platform_admin', id: row.id, tenantId: null },
    email: row.email,
    passwordHash: row.passwordHash,
    status: row.status as AccountStatus,
    mfaSecretEnc: row.mfaSecretEnc,
    mfaEnabled: row.mfaEnabledAt !== null,
    // Platform admins can reach every tenant, so 2FA is never optional for them.
    mfaRequired: true,
    permissions: [],
    failedLoginCount: row.failedLoginCount,
    lockedUntil: row.lockedUntil,
  };
}
