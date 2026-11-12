import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../shared/application/ports.js';

export interface AuditRecord {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: string;
}

export abstract class AuditLogReader {
  /** Newest first. Requires a tenant unit of work. */
  abstract latest(limit: number): Promise<AuditRecord[]>;
}

export const MAX_AUDIT_PAGE = 100;

@Injectable()
export class ListAuditLogUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly reader: AuditLogReader,
  ) {}

  execute(tenantId: string, limit = 50): Promise<AuditRecord[]> {
    const bounded = Math.min(Math.max(Math.trunc(limit) || 1, 1), MAX_AUDIT_PAGE);
    return this.uow.runInTenant(tenantId, () => this.reader.latest(bounded));
  }
}
