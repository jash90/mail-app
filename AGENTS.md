# AGENTS.md — Root Project Rules

<!-- Scope: Global project rules, architecture, conventions, and development commands.
     Source: Migrated from CLAUDE.md and .claude/rules/01–05. -->

## Project Overview

React Native email client built with Expo SDK 54, connecting to Gmail API. Features: email reading/composing, AI summaries (cloud via Z.AI/OpenRouter or on-device via llama.rn), Polish TTS email reading (Sherpa ONNX), hybrid search (FTS + Gmail API + reranker), email statistics, and contact ranking. iOS-focused development build — Google Sign-In requires native modules so Expo Go won't work.

## Development Commands

```bash
bun start              # Start Expo dev server (Metro)
bun run ios            # Build and run on iOS simulator (development build)
bun run android        # Build and run on Android emulator
bun run lint           # ESLint (expo + prettier rules)
bun run format         # Prettier across app/, components/, features/, db/, lib/, config/, store/
bun run format:check   # Check formatting without writing
bun run typecheck      # tsc --noEmit
bun run check          # lint + typecheck together
bun run test           # Run all tests (Jest with jest-expo/ios preset)
bun run test -- --testPathPattern=<name>  # Run a single test file by name
bun run test:watch     # Watch mode
bunx drizzle-kit generate  # Generate migration from schema changes
bunx drizzle-kit push      # Push schema changes (dev only)
```

**Critical:** Always use `npx expo run:ios` or `bun run ios` for dev builds. `npx expo start` launches Expo Go which crashes on `RNGoogleSignin`.

## Architecture

### Directory Structure

| Directory | Purpose |
|-----------|---------|
| `app/` | Expo Router file-based screens and layouts |
| `components/` | Shared, reusable UI components |
| `config/` | App-wide configuration constants |
| `db/` | SQLite database: Drizzle schema, client, repositories |
| `drizzle/` | SQL migration files (auto-run on app start) |
| `features/` | Feature modules: ai, auth, gmail, search, stats, tts |
| `lib/` | Shared utilities (rate limiter, Sentry, PostHog, analytics) |
| `store/` | Zustand stores (auth, AI settings, TTS voice) |
| `tests/` | Test files mirroring source tree |
| `plugins/` | Custom Expo config plugins |

### Data Flow

```
Gmail API → features/gmail/api.ts (rate-limited) → SQLite (Drizzle ORM) → React Query → UI
```

Sync runs on a 2-minute interval via `syncManager.ts`. Incremental sync uses Gmail History API; first sync paginates through all threads. `resourceLock.ts` ensures AI inference and network sync don't run simultaneously (RAM constraint on-device).

### State Management

- **Zustand** with SecureStore persistence — auth, AI settings, TTS voice
- **React Query** — Server state caching (24h staleTime for Gmail threads)
- **SQLite** — Persistent local storage, offline-first cache, summary cache, FTS5 search index

## Global Conventions

- **Path alias:** `@/*` maps to project root (tsconfig paths).
- **Styling:** Tailwind CSS via UniWind (`global.css`, `uniwind-types.d.ts`).
- **Lists:** Always use `@shopify/flash-list` instead of `FlatList`.
- **Charts:** Use `victory-native` with `@shopify/react-native-skia` renderer.
- **React Compiler:** Enabled (`app.json` → `experiments.reactCompiler`).
- **Typed routes:** Enabled (Expo Router).
- **New Architecture:** Enabled (`app.json` → `newArchEnabled`).
- **iOS deployment target:** 16.0 (enforced via custom plugin `plugins/withMinDeploymentTarget`).
- **Environment variables:** `EXPO_PUBLIC_ZAI_API_KEY`, `EXPO_PUBLIC_AI_BACKEND` (zai|openrouter), `EXPO_PUBLIC_OPENROUTER_MODEL` in `.env`.
- **Metro:** Custom config — buffer polyfill, `.sql` file imports, UniWind CSS, Sentry wrapping.

### Git Hooks (Lefthook)

Pre-commit: ESLint + Prettier (auto-fix) on staged `.ts/.tsx` files. Pre-push: typecheck + test suite.

## SOLID Principles — Summary

This codebase enforces SOLID. Domain-specific applications are in the relevant directory's `AGENTS.md`. High-level rules:

1. **Single Responsibility** — One file = one purpose. One feature = one domain. One hook = one job. One store = one slice. Files stay under 500 lines.
2. **Open/Closed** — Extend via new files and interface implementations, not by editing working code. Configuration-driven behavior over conditionals.
3. **Liskov Substitution** — All `AiProvider` implementations are interchangeable drop-ins. Decorators preserve the base contract. No caller special-cases a specific implementation.
4. **Interface Segregation** — Interfaces are small and focused. Types live with their consumers. Hooks return only what the component needs.
5. **Dependency Inversion** — Screens/hooks depend on abstractions (`getProvider()`, repository functions, `acquireAI()`), never on concrete implementations.

## Observability

- **Sentry** (`lib/sentry.ts`) — Error tracking, navigation breadcrumbs, error boundary wrapping root layout, source maps via `@sentry/react-native/expo` plugin.
- **PostHog** (`lib/posthog.ts`, `lib/analytics.ts`) — Event tracking, session analytics.

## Key Configuration

- **Bundle IDs:** `com.jash.mail-app` (iOS), `com.jash.mailapp` (Android).
- **Constants:** `config/constants.ts` — Gmail API URLs/quota units, AI model/backend config, rate limit params, Google Auth scopes.
