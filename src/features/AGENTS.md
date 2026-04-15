# AGENTS.md — Feature Modules

<!-- Scope: Rules for all code inside features/.
     Convention: Dev.to Feature-Based — each feature owns components/ + hooks/ + services/. -->

## Feature Module Boundaries

Each feature owns exactly one domain. Cross-feature coordination belongs in `app/hooks/`, not inside features.

| Module | Domain | Never handles |
|--------|--------|---------------|
| `ai/` | AI inference (cloud + on-device), token tracking, model management | Gmail, TTS, statistics |
| `auth/` | Google OAuth, token refresh, SecureStore persistence | Gmail data, AI |
| `gmail/` | Gmail API communication, sync, batch parsing, contacts, send/modify | AI, TTS, search ranking |
| `search/` | Hybrid search (FTS5 + Gmail API + BM25 reranker) | Direct Gmail mutation |
| `stats/` | Bulk email fetching, contact ranking/scoring | AI inference, auth |
| `tts/` | Sherpa ONNX offline TTS, Polish voice, queue playback | Gmail data, AI inference |

## Internal Feature Structure (Dev.to Convention)

```
features/<name>/
├── components/    # UI components specific to this feature
├── hooks/         # React hooks (data fetching, state, side effects)
├── services/      # Business logic, API calls, utilities
│                  #   In practice: *.ts at feature root + helpers/ + providers/ subdirs
├── types.ts       # Feature-scoped types
└── index.ts       # Public barrel — external consumers import only from here
```

### Current State vs Target

| Subdirectory | Current | Target |
|-------------|---------|--------|
| `components/` | Missing — UI is in `components/<feature>/` at root | `features/<name>/components/` |
| `hooks/` | Exists in `ai/`, `gmail/` | Same — keep |
| `services/` | `*.ts` at root + `helpers/` + `providers/` | May consolidate to `services/` later |

### Migration Status

Feature components still live in `components/<feature>/` at root. See `components/AGENTS.md` for migration plan. When creating or touching feature components, place them in `features/<name>/components/`.

## Cross-Feature Dependencies

```
auth ←── gmail ←── stats
              ↕
            search
```

| From → To | Imports | Via |
|-----------|---------|-----|
| `gmail` → `auth` | OAuth token functions | `@/features/auth/oauthService` |
| `search` → `gmail` | `searchViaGmailApi` | `@/features/gmail/searchApi` |
| `gmail` → `search` | `hybridSearch`, `GenerateFn`, search types | `@/features/search` |
| `stats` → `gmail` | Batch functions + types | `@/features/gmail` barrel |

- All imports go through barrel `index.ts` files, never internal paths.
- `gmail ↔ search` is bidirectional — gmail provides API access, search provides ranking logic.
- `gmail → auth` is foundational — all API calls need auth tokens.

## Expo Router Adaptation

`screens/` from the Dev.to pattern maps to `app/` at root (Expo Router file-based routing). Screens are thin wrappers that:
1. Import feature hooks and components
2. Wire features together via `app/hooks/` orchestration hooks
3. Contain minimal business logic

## AiProvider Interface

All AI providers implement `AiProvider` from `features/ai/types.ts`:

- **OCP:** New backend = new file implementing `AiProvider`, registered in `providers/index.ts`.
- **LSP:** `generate()` signature is identical across all implementations.
- **ISP:** `AiProvider` has one method. Don't inflate it.
- **DIP:** Callers use `getProvider()` — never import concrete implementations directly.

## Shared Infrastructure

These live outside `features/` in the `shared/` concept (root-level dirs):

| What | Where | Purpose |
|------|-------|---------|
| Rate limiter | `lib/rateLimiter.ts` | All Gmail API calls go through this |
| Resource lock | `lib/resourceLock.ts` | `acquireAI()`/`acquireNetwork()` — prevents OOM |
| DB repositories | `db/repositories/` | All database access |
| Zustand stores | `store/` | Global state slices |
