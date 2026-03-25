# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

React Native email client built with Expo SDK 54, connecting to Gmail API. Features: email reading/composing, AI summaries (cloud via Z.AI or on-device via llama.rn), Polish TTS email reading (Sherpa ONNX), email statistics, and contact ranking. iOS-focused development build — Google Sign-In requires native modules so Expo Go won't work.

## Development Commands

```bash
bun start              # Start Expo dev server (Metro)
bun run ios            # Build and run on iOS simulator (development build)
bun run android        # Build and run on Android emulator
bun run lint           # ESLint (expo + prettier rules)
bun run format         # Prettier across app/, components/, features/, db/, lib/, config/, store/
bun run format:check   # Check formatting without writing
```

**Critical:** Always use `npx expo run:ios` or `bun run ios` for dev builds. `npx expo start` launches Expo Go which crashes on `RNGoogleSignin`.

### Database Migrations

```bash
bunx drizzle-kit generate    # Generate migration from schema changes
bunx drizzle-kit push        # Push schema changes (dev only)
```

Migrations in `drizzle/` run automatically on app start in `app/_layout.tsx` via `useMigrations()`. New `.sql` files are importable thanks to Metro's `sourceExts` config.

## Architecture

### Routing (Expo Router — file-based)
- `app/_layout.tsx` — Root: Buffer polyfill, Sentry init, DB migrations, auth guard (`Stack.Protected`), providers (PostHog → React Query → Stack)
- `app/(tabs)/` — Bottom tabs: Inbox (`list.tsx`), Stats (`stats.tsx`), Settings (`settings.tsx`)
- `app/thread/[id].tsx` — Thread detail view
- `app/compose.tsx` — Email compose with AI generation
- `app/summary.tsx` — AI-generated email summary
- `app/login.tsx` — Google OAuth sign-in

### Feature Modules (`features/`)
- **`gmail/`** — Gmail API layer: authenticated fetch with rate limiter, React Query hooks (`useThreads`, `useMessages`), incremental sync via History API, multipart batch request parsing, thread/message CRUD, label management, contact extraction
- **`auth/`** — Google OAuth via `@react-native-google-signin/google-signin`, token refresh with silent sign-in recovery, SecureStore persistence (`oauthService.ts`)
- **`ai/`** — Dual AI provider system (cloud Z.AI + on-device llama.rn GGUF models). Provider interface in `types.ts`, provider selection via `providers/index.ts`. Handles email generation, replies, and summary caching in SQLite. Local models: Llama 3.2 3B, Bielik 4.5B (Polish), Qwen 3 4B
- **`tts/`** — Text-to-speech via Sherpa ONNX offline TTS. Polish voice support with language detection (`franc-min`). Queue-based email reading (`useEmailTTSQueue`)
- **`stats/`** — Bulk email fetching with retry logic, contact ranking/statistics

### Data Flow
```
Gmail API → features/gmail/api.ts (rate-limited) → SQLite (Drizzle ORM) → React Query → UI
```

### Database (`db/`)
- **SQLite + Drizzle ORM** with WAL mode, foreign keys enabled
- `db/schema.ts` — 10 tables: threads, threadLabels, participants, threadParticipants, messages, messageRecipients, attachments, labels, summaryCache, syncState
- `db/repositories/` — Data access layer: threads, messages, labels, stats, syncState
- `drizzle/` — SQL migrations (auto-run on app start)
- Tables use snake_case columns, timestamps as ISO strings, booleans as integer mode

### State Management
- **Zustand** with SecureStore persistence — `store/authStore.ts` (auth), `store/aiSettingsStore.ts` (AI provider choice), `store/polishVoiceStore.ts` (TTS voice selection)
- **React Query** — Server state caching (24h staleTime for gmail threads)
- **SQLite** — Persistent local storage, offline-first cache, summary cache

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
- **Environment:** `EXPO_PUBLIC_ZAI_API_KEY` in `.env` (see `.env.example`)
- **Metro:** Custom config — buffer polyfill, `.sql` file imports, UniWind CSS, Sentry wrapping
- **Constants:** `config/constants.ts` — Gmail API URLs/quota units, AI model config, rate limit params
- **iOS deployment target:** 16.0 (enforced via custom plugin `plugins/withMinDeploymentTarget`)

## Conventions

- Feature-driven folder structure, not file-type grouping
- Repository pattern for DB access (`db/repositories/*.ts`)
- React Query keys centralized in `features/gmail/queryKeys.ts`
- Batch Gmail API calls use multipart/mixed with custom boundary parsing (`features/gmail/helpers/batch.ts`)
- AI provider abstraction: `AiProvider` interface with `generate()` method — cloud and local implement it
- Zustand stores use SecureStore-backed persistence
- No test suite currently — lint and type checking only
