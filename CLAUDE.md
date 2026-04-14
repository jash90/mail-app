# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
```

**Critical:** Always use `npx expo run:ios` or `bun run ios` for dev builds. `npx expo start` launches Expo Go which crashes on `RNGoogleSignin`.

### Testing

```bash
bun run test                          # Run all tests (Jest with jest-expo/ios preset)
bun run test -- --testPathPattern=rateLimiter  # Run a single test file by name
bun run test:watch                    # Watch mode
```

Tests live in `tests/` mirroring the source tree (e.g. `tests/features/gmail/helpers/batch.test.ts`). DB tests use `better-sqlite3` in-memory databases via `tests/db/testDb.ts` (creates schema from raw SQL, not Drizzle migrations). Native modules (expo-secure-store, expo-sqlite, react-native-reanimated, Sentry) are mocked in `tests/setup.ts`.

### Database Migrations

```bash
bunx drizzle-kit generate    # Generate migration from schema changes
bunx drizzle-kit push        # Push schema changes (dev only)
```

Migrations in `drizzle/` run automatically on app start in `app/_layout.tsx` via `useMigrations()`. New `.sql` files are importable thanks to Metro's `sourceExts` config.

### Git Hooks (Lefthook)

Pre-commit: ESLint + Prettier (auto-fix) on staged `.ts/.tsx` files. Pre-push: typecheck + test suite.

## Architecture

### Routing (Expo Router — file-based)
- `app/_layout.tsx` — Root: Buffer polyfill, Sentry init, DB migrations, auth guard (`Stack.Protected`), providers (PostHog → React Query → Stack)
- `app/(tabs)/` — Bottom tabs: Inbox (`list.tsx`), Stats (`stats.tsx`), Settings (`settings.tsx`), Summary (`summary.tsx`)
- `app/thread/[id].tsx` — Thread detail view
- `app/compose.tsx` — Email compose with AI generation
- `app/contact-tiers.tsx` — Contact importance tiers
- `app/ai-tokens.tsx` — AI token usage dashboard
- `app/login.tsx` — Google OAuth sign-in

### Feature Modules (`features/`)
- **`gmail/`** — Gmail API layer: authenticated fetch with rate limiter, React Query hooks (`useThreads`, `useMessages`), incremental sync via History API + pagination, multipart batch request parsing, thread/message CRUD, label management, contact extraction. `syncManager.ts` runs a 2-minute interval sync cycle with app-state-aware start/stop.
- **`auth/`** — Google OAuth via `@react-native-google-signin/google-signin`, token refresh with silent sign-in recovery, SecureStore persistence (`oauthService.ts`)
- **`ai/`** — Dual AI provider system (cloud + on-device llama.rn GGUF models). Provider interface `AiProvider` in `types.ts`, selection via `providers/index.ts`. Cloud backend configurable via `EXPO_PUBLIC_AI_BACKEND` (zai or openrouter). `resourceLock.ts` coordinates AI inference and network sync to avoid concurrent RAM pressure. Token usage tracked in SQLite (`tokenTracker.ts`).
- **`tts/`** — Text-to-speech via Sherpa ONNX offline TTS. Polish voice support with language detection (`franc-min`). Queue-based email reading (`useEmailTTSQueue`)
- **`stats/`** — Bulk email fetching with retry logic, contact ranking/statistics, contact importance scoring
- **`search/`** — Hybrid search: local FTS5 index (`db/repositories/search/`) + Gmail API search + BM25 reranker. `hybridSearch.ts` merges results from both sources.

### Data Flow
```
Gmail API → features/gmail/api.ts (rate-limited) → SQLite (Drizzle ORM) → React Query → UI
```

Sync runs on a 2-minute interval via `syncManager.ts`. Incremental sync uses Gmail History API; first sync paginates through all threads. `resourceLock.ts` ensures AI inference and network sync don't run simultaneously (RAM constraint on-device).

### Database (`db/`)
- **SQLite + Drizzle ORM** with WAL mode, foreign keys enabled (`db/client.ts`)
- `db/schema.ts` — Tables: threads, threadLabels, participants, threadParticipants, messages, messageRecipients, attachments, labels, summaryCache, syncState, aiTokenUsage, userActions, plus FTS5 virtual tables in `db/repositories/search/`
- `db/repositories/` — Data access layer organized by domain: `threads/` (upsert, mutations, queries, hydration, search), `messages/` (queries, mutations), `labels.ts`, `stats/` (computeStats, contactImportance, helpers), `syncState.ts`, `aiTokens.ts`, `userActions.ts`, `search/` (FTS indexing + queries)
- `drizzle/` — SQL migrations (auto-run on app start)
- Tables use snake_case columns, timestamps as ISO strings, booleans as integer mode

### State Management
- **Zustand** with SecureStore persistence — `store/authStore.ts` (auth), `store/aiSettingsStore.ts` (AI provider choice), `store/polishVoiceStore.ts` (TTS voice selection)
- **React Query** — Server state caching (24h staleTime for gmail threads)
- **SQLite** — Persistent local storage, offline-first cache, summary cache, FTS5 search index

### Resource Lock (`features/ai/resourceLock.ts`)
Coordinates on-device AI inference and Gmail network sync. Only one can be active at a time to avoid OOM on mobile. Uses a waiter queue with AbortSignal support. `acquireAI()`/`releaseAI()` for inference, `acquireNetwork()`/`releaseNetwork()` for sync.

### Rate Limiting (`lib/rateLimiter.ts`)
Centralized rate limiter with exponential backoff (base 1s, max 30s, 5 retries), Retry-After header support, jitter. Shared throttle state across all Gmail API calls.

### Observability
- **Sentry** (`lib/sentry.ts`) — Error tracking, navigation breadcrumbs, error boundary wrapping root layout, source maps via `@sentry/react-native/expo` plugin
- **PostHog** (`lib/posthog.ts`, `lib/analytics.ts`) — Event tracking, session analytics

## Key Configuration

- **Path alias:** `@/*` maps to project root (tsconfig paths)
- **Styling:** Tailwind CSS via UniWind (`global.css`, `uniwind-types.d.ts`)
- **React Compiler:** Enabled (`app.json` → `experiments.reactCompiler`)
- **Typed routes:** Enabled (Expo Router)
- **New Architecture:** Enabled (`app.json` → `newArchEnabled`)
- **Bundle IDs:** `com.jash.mail-app` (iOS), `com.jash.mailapp` (Android)
- **Environment:** `EXPO_PUBLIC_ZAI_API_KEY`, `EXPO_PUBLIC_AI_BACKEND` (zai|openrouter), `EXPO_PUBLIC_OPENROUTER_MODEL` in `.env`
- **Metro:** Custom config — buffer polyfill, `.sql` file imports, UniWind CSS, Sentry wrapping
- **Constants:** `config/constants.ts` — Gmail API URLs/quota units, AI model/backend config, rate limit params, Google Auth scopes
- **iOS deployment target:** 16.0 (enforced via custom plugin `plugins/withMinDeploymentTarget`)

## Conventions

- Feature-driven folder structure, not file-type grouping
- One exported component per `.tsx` file — no inline utility functions in component files
- Repository pattern for DB access (`db/repositories/`)
- React Query keys centralized in `features/gmail/queryKeys.ts`
- Batch Gmail API calls use multipart/mixed with custom boundary parsing (`features/gmail/helpers/batch.ts`)
- AI provider abstraction: `AiProvider` interface with `generate()` method — cloud and local implement it
- Zustand stores use SecureStore-backed persistence
- Charts use `victory-native` with `@shopify/react-native-skia` renderer
- Lists use `@shopify/flash-list` instead of FlatList

## SOLID Principles

This codebase follows SOLID. Detailed rules with project-specific examples live in `.claude/rules/01-*.md` through `05-*.md`. Summary:

- **Single Responsibility** — One file = one purpose. Features own one domain. Hooks do one thing. Stores own one slice. Files stay under 500 lines.
- **Open/Closed** — Extend via new files and interface implementations, not by editing working code. New AI backend = new provider file implementing `AiProvider`. New query = new repository file. New model = new entry in config array.
- **Liskov Substitution** — All `AiProvider` implementations are interchangeable drop-ins. Decorators like `anonymizingCloud` preserve the base contract. No caller special-cases a specific implementation.
- **Interface Segregation** — Interfaces are small and focused (`AiProvider` has one method). Types live with their consumers, not in a global dump. Hooks return only what the component needs.
- **Dependency Inversion** — Screens/hooks depend on abstractions (`getProvider()`, repository functions, `acquireAI()`), never on concrete implementations. Features don't import other features' internals — coordination happens in the screen/hook layer.
