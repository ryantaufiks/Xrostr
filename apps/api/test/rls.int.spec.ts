import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

/**
 * Proves isolation at the database level, independent of application code:
 * the runtime role sees only the tenant set in `app.tenant_id`, and nothing without it.
 */
describe('Row Level Security', () => {
  const owner = new pg.Pool({ connectionString: inject('ownerUrl'), max: 1 });
  const app = new pg.Pool({ connectionString: inject('appUrl'), max: 2 });
  let tenantA: string;
  let tenantB: string;
  let userB: string;

  beforeAll(async () => {
    const insertTenant = (slug: string) =>
      owner
        .query<{ id: string }>(
          `insert into tenants (id, name, slug, data_region, plan) values (gen_random_uuid(), $1, $1, 'sg', 'starter') returning id`,
          [slug],
        )
        .then((r) => r.rows[0]!.id);
    tenantA = await insertTenant('rls-tenant-a');
    tenantB = await insertTenant('rls-tenant-b');
    await owner.query(
      `insert into users (id, tenant_id, email, full_name) values (gen_random_uuid(), $1, 'a@example.com', 'User A')`,
      [tenantA],
    );
    userB = await owner
      .query<{ id: string }>(
        `insert into users (id, tenant_id, email, full_name) values (gen_random_uuid(), $1, 'b@example.com', 'User B') returning id`,
        [tenantB],
      )
      .then((r) => r.rows[0]!.id);
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end()]);
  });

  /** Runs statements as the app role inside one transaction with an optional tenant context. */
  async function asApp<T>(
    tenantId: string | null,
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await app.connect();
    try {
      await client.query('begin');
      if (tenantId) await client.query(`select set_config('app.tenant_id', $1, true)`, [tenantId]);
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  it('shows only the current tenant rows', async () => {
    const rows = await asApp(tenantA, (c) =>
      c.query('select email from users where email like $1', ['%@example.com']),
    );
    expect(rows.rows.map((r) => r.email)).toEqual(['a@example.com']);
  });

  it('shows nothing when no tenant context is set', async () => {
    const rows = await asApp(null, (c) => c.query('select id from users'));
    expect(rows.rowCount).toBe(0);
  });

  it('rejects writing a row into another tenant', async () => {
    await expect(
      asApp(tenantA, (c) =>
        c.query(
          `insert into users (id, tenant_id, email, full_name) values (gen_random_uuid(), $1, 'x@example.com', 'X')`,
          [tenantB],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('cannot update another tenant row even by id', async () => {
    const result = await asApp(tenantA, (c) =>
      c.query(`update users set full_name = 'hacked' where id = $1`, [userB]),
    );
    expect(result.rowCount).toBe(0);
    const check = await owner.query('select full_name from users where id = $1', [userB]);
    expect(check.rows[0]!.full_name).toBe('User B');
  });

  it('does not let the app role bypass RLS or alter the audit log', async () => {
    const role = await owner.query(
      `select rolbypassrls, rolsuper from pg_roles where rolname = 'xrostr_app'`,
    );
    expect(role.rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });
    await expect(
      asApp(tenantA, (c) => c.query(`update audit_log set action = 'x'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(asApp(tenantA, (c) => c.query('delete from audit_log'))).rejects.toThrow(
      /permission denied/,
    );
  });
});
