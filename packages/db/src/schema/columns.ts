import { sql } from 'drizzle-orm';
import { integer, pgPolicy, pgRole, timestamp, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

/** Runtime role used by the API and worker. It owns nothing and cannot bypass RLS. */
export const appRole = pgRole('xrostr_app').existing();

/** Session variable carrying the tenant of the current transaction. */
export const TENANT_SETTING = 'app.tenant_id';

const currentTenant = sql.raw(`nullif(current_setting('${TENANT_SETTING}', true), '')::uuid`);

export const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Optimistic-locking counter; increment on every update. */
export const version = () => integer('version').notNull().default(1);

/**
 * Every tenant-scoped table gets this policy. Without `app.tenant_id` set, the
 * expression is NULL and the table looks empty, so a missing context fails closed.
 */
export const tenantIsolation = (table: string) =>
  pgPolicy(`${table}_tenant_isolation`, {
    as: 'permissive',
    for: 'all',
    to: appRole,
    using: sql`tenant_id = ${currentTenant}`,
    withCheck: sql`tenant_id = ${currentTenant}`,
  });
