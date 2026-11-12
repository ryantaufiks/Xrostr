import { Injectable } from '@nestjs/common';
import { AuditLogger, UnitOfWork, type AuditEntry } from '../../../shared/application/ports.js';
import type { SubjectRef } from '../domain/account.js';

/** Runs work and writes audit records in the scope a subject lives in (platform or tenant). */
@Injectable()
export class SubjectScope {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditLogger,
  ) {}

  run<T>(subject: SubjectRef, work: () => Promise<T>): Promise<T> {
    return subject.tenantId
      ? this.uow.runInTenant(subject.tenantId, work)
      : this.uow.runInPlatform(work);
  }

  record(subject: SubjectRef, entry: Omit<AuditEntry, 'actorType' | 'actorId'>): Promise<void> {
    const full: AuditEntry = { ...entry, actorType: subject.type, actorId: subject.id };
    return subject.tenantId ? this.audit.recordTenant(full) : this.audit.recordPlatform(full);
  }
}
