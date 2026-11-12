import { Injectable } from '@nestjs/common';
import type { SystemRoleDefinition } from '@xrostr/contracts';
import { roles, sessions, userInvites, userRoles } from '@xrostr/db';
import { and, eq, isNull } from 'drizzle-orm';
import { DatabaseContext } from '../../../shared/infrastructure/database/database-context.js';
import {
  InviteRepository,
  RoleRepository,
  SessionRepository,
  type Invite,
  type NewSession,
  type Session,
} from '../application/ports.js';
import type { SubjectRef, SubjectType } from '../domain/account.js';

@Injectable()
export class DrizzleRoleRepository extends RoleRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async insertSystemRoles(
    definitions: readonly SystemRoleDefinition[],
  ): Promise<Map<string, string>> {
    const tenantId = this.ctx.tenantId();
    const rows = await this.ctx
      .executor()
      .insert(roles)
      .values(
        definitions.map((d) => ({
          tenantId,
          key: d.key,
          name: d.name,
          permissions: [...d.permissions],
          mfaRequired: d.mfaRequired,
          isSystem: true,
        })),
      )
      .returning({ id: roles.id, key: roles.key });
    return new Map(rows.map((r) => [r.key, r.id]));
  }

  async assign(userId: string, roleId: string): Promise<void> {
    await this.ctx
      .executor()
      .insert(userRoles)
      .values({ tenantId: this.ctx.tenantId(), userId, roleId });
  }
}

@Injectable()
export class DrizzleInviteRepository extends InviteRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async insert(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.ctx
      .executor()
      .insert(userInvites)
      .values({ tenantId: this.ctx.tenantId(), userId, tokenHash, expiresAt });
  }

  async findByTokenHash(tokenHash: string): Promise<Invite | null> {
    const [row] = await this.ctx
      .executor()
      .select({
        id: userInvites.id,
        userId: userInvites.userId,
        expiresAt: userInvites.expiresAt,
        acceptedAt: userInvites.acceptedAt,
      })
      .from(userInvites)
      .where(eq(userInvites.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  }

  async markAccepted(id: string, at: Date): Promise<void> {
    await this.ctx
      .executor()
      .update(userInvites)
      .set({ acceptedAt: at })
      .where(eq(userInvites.id, id));
  }
}

@Injectable()
export class DrizzleSessionRepository extends SessionRepository {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async insert(session: NewSession): Promise<string> {
    const [row] = await this.ctx
      .executor()
      .insert(sessions)
      .values({
        subjectType: session.subject.type,
        subjectId: session.subject.id,
        tenantId: session.subject.tenantId,
        familyId: session.familyId,
        tokenHash: session.tokenHash,
        stage: session.stage,
        expiresAt: session.expiresAt,
        userAgent: session.userAgent,
        ip: session.ip,
      })
      .returning({ id: sessions.id });
    return row!.id;
  }

  async findById(id: string): Promise<Session | null> {
    const [row] = await this.ctx
      .executor()
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      subject: { type: row.subjectType as SubjectType, id: row.subjectId, tenantId: row.tenantId },
      familyId: row.familyId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      replacedBy: row.replacedBy,
    };
  }

  async markRotated(id: string, replacedBy: string, at: Date): Promise<void> {
    await this.ctx
      .executor()
      .update(sessions)
      .set({ revokedAt: at, replacedBy })
      .where(eq(sessions.id, id));
  }

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await this.ctx
      .executor()
      .update(sessions)
      .set({ revokedAt: at })
      .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
  }
  async revokeAllForSubject(subject: SubjectRef, at: Date): Promise<void> {
    await this.ctx
      .executor()
      .update(sessions)
      .set({ revokedAt: at })
      .where(
        and(
          eq(sessions.subjectType, subject.type),
          eq(sessions.subjectId, subject.id),
          isNull(sessions.revokedAt),
        ),
      );
  }
}
