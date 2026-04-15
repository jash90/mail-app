# AGENTS.md — Root Project Rules

<!-- Scope: Global project rules, architecture, conventions.
     Source of truth for architecture — CLAUDE.md only covers commands and tooling config.
     Convention: Dev.to Feature-Based Architecture adapted for React Native + Expo Router. -->

## Project Overview

React Native email client built with Expo SDK 54, connecting to Gmail API. Features: email reading/composing, AI summaries (cloud via Z.AI/OpenRouter or on-device via llama.rn), Polish TTS email reading (Sherpa ONNX), hybrid search (FTS + Gmail API + reranker), email statistics, and contact ranking. iOS-focused development build — Google Sign-In requires native modules so Expo Go won't work.

## Architecture — Feature-Based

Code is grouped by **domain** (feature), not by file type. Each feature owns its components, services, and types. Cross-cutting concerns go into `shared/`.

### Structure Overview

This project follows the **Feature-Based** convention adapted for Expo Router:

```
├── features/          # Feature modules — each owns one domain
│   ├── ai/            #   components/ + hooks/ + services/
│   ├── auth/
│   ├── gmail/
│   ├── search/
│   ├── stats/
│   └── tts/
│
├── shared/            # Cross-cutting concerns (root-level dirs)
│   ├── components/    # → components/    (shared UI)
│   ├── services/      # → lib/ + db/ + store/ (shared logic & data)
│   ├── types/         # → types/         (shared types)
│   └── config/        # → config/        (shared config)
│
├── app/               # Screens (Expo Router — replaces features/*/screens/)
├── tests/             # Test files mirroring source tree
├── drizzle/           # SQL migration files
├── plugins/           # Custom Expo config plugins
├── scripts/           # Build/utility scripts
├── e2e/               # End-to-end test specs
├── landing/           # Landing page (standalone web)
├── fastlane/          # iOS deployment
└── profiles/          # Expo build profiles
```

> **Note:** `shared/` is a conceptual grouping. In this project, shared concerns live in root-level directories (`components/`, `lib/`, `db/`, `store/`, `types/`, `config/`). This avoids deep nesting while preserving the same separation.

### Directory Mapping

| Root Directory | Dev.to Equivalent | Purpose |
|----------------|-------------------|---------|
| `features/` | `features/` | Self-contained feature modules |
| `components/` | `shared/components/` | Shared UI components (used by 3+ features) |
| `lib/` | `shared/services/` | Shared utilities (rate limiter, Sentry, PostHog, formatting) |
| `db/` | `shared/services/` | SQLite database: Drizzle schema, client, repositories |
| `store/` | `shared/services/` | Zustand stores (auth, AI settings, TTS voice) |
| `types/` | `shared/types/` | TypeScript interfaces used across 2+ features |
| `config/` | `shared/config/` | App-wide configuration constants |
| `app/` | `features/*/screens/` | Expo Router file-based screens (cannot live inside features) |
| `tests/` | — | Test files mirroring source tree |
| `drizzle/` | — | SQL migrations (auto-run on app start) |
| `plugins/` | — | Custom Expo config plugins |

### Feature Module Structure

Each feature follows this canonical layout:

```
features/<name>/
├── components/    # UI components owned by this feature
├── hooks/         # React hooks (data fetching, state, side effects)
├── services/      # Business logic, API calls, utilities, providers
│                  #   (currently: *.ts at feature root + helpers/ + providers/)
├── types.ts       # Feature-scoped types
└── index.ts       # Public barrel — all external imports go through here
```

**React Native adaptations from Dev.to pattern:**
- `screens/` → `app/` (Expo Router file-based routing — screens cannot live inside features)
- `hooks/` → RN-specific addition (not in vanilla pattern, but essential in React Native)
- `services/` → encompasses current `*.ts` root files, `helpers/`, and `providers/` subdirectories

### Where New Code Goes

| What | Where |
|------|-------|
| New component for a specific feature | `features/<name>/components/` |
| New hook for a specific feature | `features/<name>/hooks/` |
| New service/logic for a feature | `features/<name>/` (new `*.ts` file or `helpers/`) |
| New cross-feature generic component | `components/` (must be used by 3+ features) |
| New screen route | `app/` (Expo Router constraint) |
| New screen orchestration hook | `app/hooks/` |
| New shared type (used by 2+ features) | `types/` |
| New feature-scoped type | `features/<name>/types.ts` |
| New DB query/mutation | `db/repositories/<domain>/` (new file) |
| New shared utility | `lib/` (only if used by 2+ features) |

### Cross-Feature Dependencies

Features import from other features **only through barrel `index.ts` files**. The actual dependency graph:

```
auth ←── gmail ←── stats
              ↕
            search
```

| From → To | What's imported | Why it's allowed |
|-----------|----------------|-----------------|
| `gmail` → `auth` | OAuth token functions | Auth is foundational — all API calls need tokens |
| `search` → `gmail` | `searchViaGmailApi` | Gmail re-exports search API as public service |
| `gmail` → `search` | `hybridSearch`, search types | Gmail provides search hooks to UI (bidirectional with gmail↔search) |
| `stats` → `gmail` | Batch fetch functions + types | Gmail re-exports batch/message types |

All other coordination happens in the screen/hook layer (`app/hooks/`). The screen receives data from feature A and passes it to feature B as parameters.

### Data Flow

```
Gmail API → features/gmail/api.ts (rate-limited) → SQLite (Drizzle ORM) → React Query → UI
```

Sync runs on a 2-minute interval via `syncManager.ts`. Incremental sync uses Gmail History API; first sync paginates through all threads. `lib/resourceLock.ts` ensures AI inference and network sync don't run simultaneously (RAM constraint on-device).

### State Management

- **Zustand** with SecureStore persistence — auth, AI settings, TTS voice
- **React Query** — Server state caching (5min staleTime global, query-specific overrides)
- **SQLite** — Persistent local storage, offline-first cache, summary cache, FTS5 search index

### Routing (Expo Router — replaces `features/*/screens/`)

| Path | Purpose |
|------|---------|
| `_layout.tsx` | Root: Buffer polyfill, Sentry init, DB migrations, auth guard, providers |
| `index.tsx` | Root redirect to inbox |
| `(tabs)/_layout.tsx` | Tab navigator layout |
| `(tabs)/list.tsx` | Inbox — threads list |
| `(tabs)/stats.tsx` | Statistics dashboard |
| `(tabs)/settings.tsx` | Settings |
| `(tabs)/summary.tsx` | AI summaries |
| `thread/[id].tsx` | Thread detail view |
| `compose.tsx` | Email compose with AI generation |
| `contact-tiers.tsx` | Contact importance tiers |
| `ai-tokens.tsx` | AI token usage dashboard |
| `login.tsx` | Google OAuth sign-in |

Screens are thin wrappers — orchestration and business logic live in `app/hooks/` or feature hooks.

### Component Ownership

- **Feature-specific components** → `features/<name>/components/` (target)
- **Shared generic components** → `components/` (only if used by 3+ features)
- **Legacy components** in `components/<feature>/` → migrate on touch into their feature's `components/`

### Observability

- **Sentry** (`lib/sentry.ts`) — Error tracking, navigation breadcrumbs, error boundary
- **PostHog** (`lib/posthog.ts`, `lib/analytics.ts`) — Event tracking, session analytics

## SOLID Principles

This codebase enforces SOLID. Detailed project-specific examples are in `.claude/rules/solid.md`.

1. **Single Responsibility** — One file = one purpose. One feature = one domain. One hook = one job. One store = one slice. Files stay under 500 lines.
2. **Open/Closed** — Extend via new files and interface implementations, not by editing working code. Configuration-driven behavior over conditionals.
3. **Liskov Substitution** — All `AiProvider` implementations are interchangeable drop-ins. Decorators preserve the base contract. No caller special-cases a specific implementation.
4. **Interface Segregation** — Interfaces are small and focused. Types live with their consumers. Hooks return only what the component needs.
5. **Dependency Inversion** — Screens/hooks depend on abstractions (`getProvider()`, repository functions, `acquireAI()`), never on concrete implementations.

## Key Configuration

- **Bundle IDs:** `com.jash.mail-app` (iOS), `com.jash.mailapp` (Android).
- **Constants:** `config/constants.ts` — Gmail API URLs/quota units, AI model/backend config, rate limit params, Google Auth scopes.
