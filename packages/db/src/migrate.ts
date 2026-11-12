import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { createDatabase } from './client.js';

const APP_ROLE = 'hrms_app';
/** Tables the app may append to but never change or delete from. */
const APPEND_ONLY_TABLES = ['audit_log', 'platform_audit_log'];

export interface MigrateOptions {
  /** Connection string of the owner role that owns the schema. */
  ownerUrl: string;
  /** Password set on the runtime role `hrms_app`. */
  appPassword: string;
}

/**
 * Brings a database to the latest schema and enforces the role model:
 * the owner owns every table, the app role gets DML only and is subject to RLS.
 * Safe to run repeatedly.
 */
export async function migrateDatabase({ ownerUrl, appPassword }: MigrateOptions): Promise<void> {
  const handle = createDatabase(ownerUrl, { max: 1 });
  try {
    await ensureAppRole(handle.pool, appPassword);
    const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
    await migrate(handle.db, { migrationsFolder });
    await applyGrants(handle.pool);
  } finally {
    await handle.close();
  }
}

async function ensureAppRole(pool: pg.Pool, password: string): Promise<void> {
  const literal = pg.escapeLiteral(password);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
        CREATE ROLE ${APP_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD ${literal};
      ELSE
        ALTER ROLE ${APP_ROLE} WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${literal};
      END IF;
    END
    $$;
  `);
}

async function applyGrants(pool: pg.Pool): Promise<void> {
  await pool.query(`
    GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE};
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE};
    REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM ${APP_ROLE};
    ${APPEND_ONLY_TABLES.map((t) => `REVOKE UPDATE, DELETE, TRUNCATE ON ${t} FROM ${APP_ROLE};`).join('\n')}
  `);
}
