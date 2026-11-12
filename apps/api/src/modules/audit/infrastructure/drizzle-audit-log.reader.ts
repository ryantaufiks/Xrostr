import { Injectable } from '@nestjs/common';
import { auditLog } from '@inroster/db';
import { desc } from 'drizzle-orm';
import { DatabaseContext } from '../../../shared/infrastructure/database/database-context.js';
import { AuditLogReader, type AuditRecord } from '../application/list-audit-log.use-case.js';

@Injectable()
export class DrizzleAuditLogReader extends AuditLogReader {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async latest(limit: number): Promise<AuditRecord[]> {
    const rows = await this.ctx
      .executor()
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      actorType: r.actorType,
      actorId: r.actorId,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
