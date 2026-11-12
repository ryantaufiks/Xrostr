# ADR 0002: Tenant isolation with PostgreSQL Row Level Security

Status: accepted (2026-11-12)

## Decision

- Two database roles. `hrms_owner` owns the schema and runs migrations. `hrms_app` is the only
  role the API and worker use: `NOSUPERUSER NOBYPASSRLS`, owns nothing, DML grants only.
- Every tenant-scoped table has `tenant_id NOT NULL` and the policy
  `tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid` for both `USING` and
  `WITH CHECK`. Policies are declared in the Drizzle schema (`tenantIsolation()`).
- `UnitOfWork.runInTenant(tenantId, …)` opens a transaction and runs
  `set_config('app.tenant_id', $1, true)`. The setting is transaction-local, so a pooled
  connection never carries it to the next request.
- Without a tenant context the expression is NULL and tenant tables read as empty: a missing
  context fails closed instead of leaking.
- Platform tables (`tenants`, `platform_admins`, `sessions`, `outbox_events`,
  `platform_audit_log`) have no tenant business data and no policy. `sessions` stores only
  SHA-256 hashes of refresh secrets.
- Superadmins have no `BYPASSRLS` path. Cross-tenant platform work, such as onboarding, enters
  each tenant's context explicitly and is written to `platform_audit_log`.
- `audit_log` and `platform_audit_log` are append-only: `UPDATE`, `DELETE` and `TRUNCATE` are
  revoked from `hrms_app`.

## Verification

`apps/api/test/rls.int.spec.ts` runs as `hrms_app` against a real PostgreSQL and proves:
reads are scoped, no context means no rows, cross-tenant inserts are rejected, cross-tenant
updates touch nothing, and the audit log cannot be changed. CI fails if any of these regress.
