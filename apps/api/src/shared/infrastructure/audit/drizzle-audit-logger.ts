import { Injectable } from '@nestjs/common';
import { auditLog, platformAuditLog } from '@inroster/db';
import { AuditLogger, type AuditEntry } from '../../application/ports.js';
import { DatabaseContext } from '../database/database-context.js';

@Injectable()
export class DrizzleAuditLogger extends AuditLogger {
  constructor(private readonly ctx: DatabaseContext) {
    super();
  }

  async recordTenant(entry: AuditEntry): Promise<void> {
    await this.ctx
      .executor()
      .insert(auditLog)
      .values({ ...toRow(entry), tenantId: this.ctx.tenantId() });
  }

  async recordPlatform(entry: AuditEntry & { tenantId?: string | null }): Promise<void> {
    await this.ctx
      .executor()
      .insert(platformAuditLog)
      .values({ ...toRow(entry), tenantId: entry.tenantId ?? null });
  }
}

function toRow(entry: AuditEntry) {
  return {
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
    ip: entry.ip ?? null,
  };
}
