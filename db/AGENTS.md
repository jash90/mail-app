# AGENTS.md — Database Layer

<!-- Scope: Rules for db/ — Drizzle ORM schema, SQLite client, repository pattern.
     Source: CLAUDE.md architecture section, .claude/rules/01 (SRP), 02 (OCP), 05 (DIP). -->

## Repository Pattern

All database access goes through `db/repositories/`. Screens and hooks never import Drizzle query builders or `db/schema.ts` directly — the schema is an implementation detail of the repository layer.

### Single Responsibility

- **Separate reads from writes.** `repositories/threads/queries.ts` reads threads. `repositories/threads/mutations.ts` mutates them. Never mix read and write concerns in one file.
- Repository files handle one aggregate. If a new query pattern is needed, add a new file in the relevant subdirectory — don't stuff it into an existing file.

### Repository Organization

| Path | Domain |
|------|--------|
| `repositories/threads/` | Thread CRUD: upsert, mutations, queries, hydration, search |
| `repositories/messages/` | Message queries and mutations |
| `repositories/labels.ts` | Label management |
| `repositories/stats/` | computeStats, contactImportance, helpers |
| `repositories/syncState.ts` | Sync state tracking |
| `repositories/aiTokens.ts` | AI token usage persistence |
| `repositories/userActions.ts` | User action tracking |
| `repositories/search/` | FTS5 indexing and search queries |

### Open/Closed

- Need a new query pattern? Add a file in the relevant `repositories/` subdirectory. Never bloat an existing queries file.
- Repository functions with the same return type must be interchangeable — callers must not depend on subtle ordering or shape differences.

## Schema Conventions

- Tables use **snake_case** columns.
- Timestamps are stored as **ISO strings**.
- Booleans use **integer mode** (0/1).
- FTS5 virtual tables live in `repositories/search/`.

## Migrations

- Migration files live in `drizzle/`.
- Migrations run automatically on app start in `app/_layout.tsx` via `useMigrations()`.
- New `.sql` files are importable thanks to Metro's `sourceExts` config.
- Generate migrations with `bunx drizzle-kit generate`.

## Client Configuration

- SQLite with **WAL mode** and **foreign keys enabled** (`db/client.ts`).
- In-memory databases for tests use `better-sqlite3` via `tests/db/testDb.ts` (raw SQL schema, not Drizzle migrations).
