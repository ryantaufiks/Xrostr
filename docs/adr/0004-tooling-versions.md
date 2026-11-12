# ADR 0004: Tooling versions

Status: accepted (2026-11-12)

| Tool              | Version     | Note                                                                                                                    |
| ----------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| Node.js           | 22 LTS      | `require(esm)` and `--env-file` built in                                                                                |
| TypeScript        | 6.0         | 7.0 (native compiler) is out, but typescript-eslint and other tooling still require < 6.1. Revisit when they support 7. |
| NestJS            | 12          | ESM-only, so the whole monorepo is ESM (`"type": "module"`, NodeNext)                                                   |
| PostgreSQL        | 17          | Testcontainers uses the same image as `docker-compose.yml`                                                              |
| Drizzle ORM / kit | 0.45 / 0.31 | RLS policies declared in schema, migrations generated and committed                                                     |
| Zod               | 4           | Shared request contracts in `@inroster/contracts`                                                                       |
| Vitest            | 5           | SWC plugin emits the decorator metadata Nest DI needs                                                                   |

The worker (`apps/worker`) is plain TypeScript, not a Nest application: the outbox relay is one
loop and gains nothing from DI. It becomes a Nest standalone app when BullMQ processors arrive
in Phase 1.
