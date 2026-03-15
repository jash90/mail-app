# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

React Native email client built with Expo SDK 54, connecting to Gmail API. Supports email reading, composing, AI summaries, and statistics. iOS-focused development build (Google Sign-In requires native modules — Expo Go won't work).

## Development Commands

```bash
bun start              # Start Expo dev server (Metro)
bun run ios            # Build and run on iOS simulator (development build)
bun run android        # Build and run on Android emulator
bun run lint           # ESLint
bun run format         # Prettier (app/, components/)
bun run format:check   # Check formatting
```

**Important:** `npx expo start` opens Expo Go which crashes on `RNGoogleSignin`. Always use `npx expo run:ios` or `bun run ios` for dev builds with native modules.

## Architecture

### Routing (Expo Router — file-based)
- `app/_layout.tsx` — Root: runs DB migrations, auth guard, React Query provider
- `app/(tabs)/` — Bottom tabs: Inbox (`list.tsx`), Stats (`stats.tsx`), Settings (`settings.tsx`)
- `app/thread/[id].tsx` — Thread detail, `app/compose.tsx` — Email compose
- `app/summary.tsx` — AI-generated email summary

### Feature Modules (`features/`)
- `features/gmail/` — Gmail API: queries, hooks, sync, batch operations, MIME parsing
  - `api.ts` — Authenticated fetch wrapper with rate limiter integration
  - `hooks.ts` — React Query hooks (`useThreads`, `useMessages`, etc.)
  - `sync.ts` — Incremental sync via Gmail History API
  - `helpers/batch.ts` — Multipart batch request/response parsing
- `features/auth/` — Google OAuth (Sign-In, token refresh, SecureStore persistence)
- `features/ai/` — Z.AI integration for email generation and summaries
- `features/stats/` — Bulk email fetching with retry logic, contact ranking

### Data Flow
```
Gmail API → features/gmail/api.ts (rate-limited) → SQLite (Drizzle ORM) → React Query → UI
```

### Database (`db/`)
- **SQLite + Drizzle ORM** with WAL mode, foreign keys enabled
- `db/schema.ts` — 9 tables: threads, messages, participants, threadParticipants, messageRecipients, attachments, labels, summaryCache, syncState
- `db/repositories/` — Data access layer per entity (threads.ts, messages.ts, etc.)
- `drizzle/` — SQL migrations, run automatically in `_layout.tsx` on app start
- Tables use snake_case columns, timestamps as ISO strings

### State Management
- **Zustand** — Auth state (`store/authStore.ts`)
- **React Query** — Server state caching (gmail data, 24h staleTime for threads)
- **SQLite** — Persistent storage, offline-first

### Rate Limiting (`lib/rateLimiter.ts`)
Centralized rate limiter with exponential backoff (base 1s, max 30s, 5 retries), Retry-After header support, jitter, and shared throttle state. Used by `features/gmail/api.ts`.

## Key Configuration

- **Path alias:** `@/*` maps to project root (tsconfig paths)
- **Styling:** Tailwind CSS via UniWind (`global.css`)
- **React Compiler:** Enabled in `app.json`
- **Typed routes:** Enabled (Expo Router)
- **Bundle ID:** `com.jash.mail-app` (iOS), `com.jash.mailapp` (Android)
- **Environment:** `EXPO_PUBLIC_ZAI_API_KEY` in `.env`
- **Metro:** Custom config for buffer resolution, `.sql` file imports, UniWind CSS

## Conventions

- Feature-driven folder structure, not file-type grouping
- Repository pattern for DB access (`db/repositories/*.ts`)
- React Query keys centralized in `features/gmail/queryKeys.ts`
- Batch Gmail API calls use multipart/mixed with custom boundary parsing
- No test suite currently — lint and type checking only
