// Cross-cutting ports. Abstract classes double as Nest injection tokens.

export abstract class Clock {
  abstract now(): Date;
}

/**
 * Runs work inside one database transaction. `runInTenant` also sets the tenant
 * context that Row Level Security reads; nested calls reuse the open transaction.
 */
export abstract class UnitOfWork {
  abstract runInPlatform<T>(work: () => Promise<T>): Promise<T>;
  abstract runInTenant<T>(tenantId: string, work: () => Promise<T>): Promise<T>;
}

/**
 * Resolves a tenant from its public slug. Tenant resolution is a platform concern
 * every module needs, so it lives in the shared kernel; tenancy owns the writes.
 */
export abstract class TenantDirectory {
  abstract findActiveIdBySlug(slug: string): Promise<string | null>;
  abstract isActive(tenantId: string): Promise<boolean>;
  abstract dataRegion(tenantId: string): Promise<string | null>;
}

/** Encrypts sensitive column values (TOTP secrets, national IDs, bank accounts). */
export abstract class SecretCipher {
  abstract encrypt(plaintext: string): string;
  abstract decrypt(ciphertext: string): string;
}

export type ActorType = 'platform_admin' | 'user' | 'system' | 'anonymous';

export interface AuditEntry {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/** Writes audit records in the caller's transaction, so they commit or roll back with the change. */
export abstract class AuditLogger {
  /** Tenant audit log; requires an active tenant unit of work. */
  abstract recordTenant(entry: AuditEntry): Promise<void>;
  abstract recordPlatform(entry: AuditEntry & { tenantId?: string | null }): Promise<void>;
}

export interface DomainEvent<TPayload extends object = Record<string, unknown>> {
  type: string;
  tenantId: string | null;
  payload: TPayload;
}

/** Transactional outbox: events are stored with the change and relayed by the worker. */
export abstract class EventPublisher {
  abstract publish(event: DomainEvent): Promise<void>;
}
