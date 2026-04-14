# AGENTS.md — Testing

<!-- Scope: Rules for tests/ — Jest test suite, mocking, DB test setup.
     Source: CLAUDE.md testing section. -->

## Test Organization

- Tests live in `tests/` mirroring the source tree (e.g. `tests/features/gmail/helpers/batch.test.ts`).
- Never place test files alongside source files. All tests go in `tests/`.

## Running Tests

```bash
bun run test                                       # All tests
bun run test -- --testPathPattern=rateLimiter       # Single file by name
bun run test:watch                                  # Watch mode
```

## Test Runner

- Jest with `jest-expo/ios` preset.

## Database Tests

- DB tests use `better-sqlite3` in-memory databases via `tests/db/testDb.ts`.
- Test DB setup creates schema from raw SQL, not Drizzle migrations.

## Mocking

- Native modules are mocked in `tests/setup.ts`: `expo-secure-store`, `expo-sqlite`, `react-native-reanimated`, Sentry.
- When adding new native module dependencies, add corresponding mocks to `tests/setup.ts`.

## Coverage

- Coverage reports go in `coverage/` (gitignored).
