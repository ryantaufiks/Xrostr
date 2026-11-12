import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable } from '@nestjs/common';
import { TENANT_SETTING, type Database, type Transaction } from '@xrostr/db';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../../application/ports.js';

export const DATABASE = Symbol('DATABASE');

interface Scope {
  tx: Transaction;
  tenantId: string | null;
}

/**
 * Holds the transaction of the current unit of work. Repositories call `executor()`
 * instead of using the pool directly, so no query can run outside a transaction
 * or, for tenant tables, without a tenant context.
 */
@Injectable()
export class DatabaseContext extends UnitOfWork {
  private readonly storage = new AsyncLocalStorage<Scope>();

  constructor(@Inject(DATABASE) private readonly db: Database) {
    super();
  }

  executor(): Transaction {
    const scope = this.storage.getStore();
    if (!scope) throw new Error('No active unit of work: wrap the call in UnitOfWork.run*().');
    return scope.tx;
  }

  tenantId(): string {
    const tenantId = this.storage.getStore()?.tenantId;
    if (!tenantId) throw new Error('No tenant context: use UnitOfWork.runInTenant().');
    return tenantId;
  }

  runInPlatform<T>(work: () => Promise<T>): Promise<T> {
    if (this.storage.getStore()) return work();
    return this.db.transaction((tx) => this.storage.run({ tx, tenantId: null }, work));
  }

  async runInTenant<T>(tenantId: string, work: () => Promise<T>): Promise<T> {
    const scope = this.storage.getStore();
    if (scope) {
      if (scope.tenantId && scope.tenantId !== tenantId) {
        throw new Error('Refusing to switch tenant inside an open unit of work.');
      }
      await this.setTenant(scope.tx, tenantId);
      return this.storage.run({ tx: scope.tx, tenantId }, work);
    }
    return this.db.transaction(async (tx) => {
      await this.setTenant(tx, tenantId);
      return this.storage.run({ tx, tenantId }, work);
    });
  }

  private async setTenant(tx: Transaction, tenantId: string): Promise<void> {
    // `true` = local to this transaction; it never leaks to the next pooled connection user.
    await tx.execute(sql`select set_config(${TENANT_SETTING}, ${tenantId}, true)`);
  }
}
