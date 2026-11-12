# Xrostr

Autonomous, multi-tenant HRMS for security agencies and shift-based workforces in Singapore and
Indonesia. This repository holds **Phase 0 — foundation**: tenancy with PostgreSQL Row Level
Security, authentication with mandatory 2FA, RBAC, audit log and a transactional outbox.

Architecture and product scope: see the PRD and `docs/adr/`.

## Layout

```
apps/
  api/          NestJS API (modular monolith)
    src/modules/
      identity/   auth, sessions, 2FA, RBAC guard, tenant provisioning
      tenancy/    tenants and legal entities (Superadmin onboarding)
      audit/      tenant audit log reader
    src/shared/   unit of work + tenant context, cipher, audit writer, outbox, HTTP plumbing
  worker/       outbox relay
packages/
  contracts/    Zod request schemas, permissions, roles, shared types
  db/           Drizzle schema with RLS policies, migrations, migrate + seed CLIs
  country-sg/   Country Pack: Singapore
  country-id/   Country Pack: Indonesia
  config/       shared TypeScript config
docs/adr/       architecture decision records
```

Each module has `domain/`, `application/`, `infrastructure/` and `interface/` layers; ESLint
blocks imports that point outward (ADR 0001).

## Getting started

Requires Node 22, pnpm 10 and Docker.

```bash
pnpm install
cp .env.example .env        # then set JWT_SECRET and FIELD_ENCRYPTION_KEY
pnpm db:up                  # PostgreSQL 17 on 127.0.0.1:5440
pnpm build
pnpm db:migrate             # creates the xrostr_app role, applies migrations and grants
pnpm db:seed                # first superadmin from SEED_SUPERADMIN_*
pnpm --filter @xrostr/api start      # http://127.0.0.1:8015
pnpm --filter @xrostr/worker start
```

## Public access via Cloudflare Tunnel

The API binds to `127.0.0.1:8015` only; the internet reaches it through `cloudflared`, so no
port is opened on the host. Example `~/.cloudflared/config.yml` for a named tunnel:

```yaml
tunnel: xrostr
credentials-file: /home/<user>/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: xrostr.cloud
    service: http://127.0.0.1:8015
  - service: http_status:404
```

```bash
cloudflared tunnel route dns xrostr xrostr.cloud
cloudflared tunnel run xrostr
```

The app trusts exactly one proxy hop (`trust proxy = 1`), so audit logs and rate limits see the
real client IP that cloudflared forwards.

## Running as a service

`deploy/systemd/` holds user units for the API and worker (paths assume the repo lives at
`~/inroster/inroster-hrms`; edit `WorkingDirectory` otherwise). PostgreSQL restarts with Docker.

```bash
pnpm build
cp deploy/systemd/xrostr-*.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now xrostr-api xrostr-worker
journalctl --user -u xrostr-api -f
```

After pulling changes: `pnpm build && pnpm db:migrate && systemctl --user restart xrostr-api xrostr-worker`.

## Onboarding flow

1. `POST /platform/auth/login` as the superadmin → session with `stage: "mfa_setup"`.
2. `POST /auth/mfa/setup` → scan `otpauthUrl` in an authenticator app.
3. `POST /auth/mfa/enable` with a code → full session.
4. `POST /platform/tenants` with legal entities (`SG`, `ID`) and the first admin → `inviteToken`.
5. `POST /auth/accept-invite` with the token and a password.
6. `POST /auth/login` with `tenantSlug`, then enrol 2FA the same way (Tenant Admin requires it).
7. `GET /tenant/legal-entities`, `GET /tenant/audit-log`.

All errors are `application/problem+json` (RFC 9457) with a stable `code`.

## API (Phase 0)

| Method    | Path                                                  | Access          |
| --------- | ----------------------------------------------------- | --------------- |
| GET       | `/health`                                             | public          |
| POST      | `/platform/auth/login`                                | public          |
| POST      | `/auth/login`, `/auth/refresh`, `/auth/accept-invite` | public, 10/min  |
| GET       | `/auth/me`                                            | any session     |
| POST      | `/auth/mfa/setup`, `/auth/mfa/enable`, `/auth/logout` | any session     |
| GET, POST | `/platform/tenants`                                   | superadmin      |
| GET       | `/tenant/legal-entities`                              | `entities.read` |
| GET       | `/tenant/audit-log?limit=`                            | `audit.read`    |

## Quality gates

```bash
pnpm format:check && pnpm lint
pnpm turbo run build typecheck test   # integration tests start PostgreSQL via Testcontainers
pnpm db:generate                      # must report no schema changes
```

CI (`.github/workflows/ci.yml`) runs the same steps on every push and pull request.

## Changing the schema

Edit `packages/db/src/schema/*`, run `pnpm db:generate`, review the SQL in
`packages/db/migrations/`, commit both. New tenant tables must use `tenantId()` and
`tenantIsolation('<table>')` and call `.enableRLS()`.
