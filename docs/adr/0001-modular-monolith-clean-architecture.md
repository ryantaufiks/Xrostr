# ADR 0001: Modular monolith with clean architecture

Status: accepted (2026-11-12)

## Decision

The backend is one NestJS deployable (`apps/api`) split into bounded-context modules under
`apps/api/src/modules/<context>/`, each with four layers:

| Layer             | May import               | Contains                                                        |
| ----------------- | ------------------------ | --------------------------------------------------------------- |
| `domain/`         | contracts, shared domain | Entities, value objects, rules. No framework, no database.      |
| `application/`    | domain, ports            | Use cases (one class per action) and ports (abstract classes).  |
| `infrastructure/` | anything                 | Adapters implementing ports: Drizzle repositories, crypto, JWT. |
| `interface/`      | application              | Controllers, guards, decorators. Thin: validate, call, map.     |

Other modules import a module only through its `public-api.ts`. ESLint `no-restricted-imports`
enforces the domain and application boundaries in CI.

Ports are abstract classes so they double as Nest injection tokens without string tokens.

## Deviation from the PRD

The PRD sketched modules as a top-level `modules/` folder. They live in `apps/api/src/modules/`
instead: NestJS compiles one TypeScript project per app, and separate workspace packages per
module would add a build step per module with no isolation benefit while there is one API.
A module can still move to its own service later because its domain and application layers
have no framework dependencies.

## Consequences

- Expected failures are returned as `Result<T, DomainError>` values and rendered as RFC 9457
  Problem Details; exceptions are reserved for bugs.
- A use case owns its transaction through `UnitOfWork`; repositories never open one.
