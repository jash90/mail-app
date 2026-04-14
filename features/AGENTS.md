# AGENTS.md — Feature Modules

<!-- Scope: Rules for all code inside features/. Governs domain isolation,
     the AiProvider contract, cross-feature coordination, and resource management.
     Source: CLAUDE.md architecture section, .claude/rules/01–05. -->

## Feature Module Boundaries

Each subdirectory owns exactly one domain:

| Module | Domain | Never handles |
|--------|--------|---------------|
| `ai/` | AI inference (cloud + on-device), token tracking | Gmail, TTS, statistics |
| `auth/` | Google OAuth, token refresh, SecureStore persistence | Gmail data, AI |
| `gmail/` | Gmail API communication, sync, batch parsing | AI, TTS, search |
| `search/` | Hybrid search (FTS5 + Gmail API + BM25 reranker) | Direct Gmail mutation |
| `stats/` | Bulk email fetching, contact ranking/scoring | AI inference, auth |
| `tts/` | Sherpa ONNX offline TTS, Polish voice, queue playback | Gmail, AI |

Never put cross-feature coordination logic inside a feature module. It belongs in the screen or orchestrating hook layer.

## AiProvider Interface Contract

All AI providers implement the `AiProvider` interface. The rules below are non-negotiable:

### Open/Closed

- Adding a new AI backend means creating a new file (e.g. `providers/ollama.ts`) that implements `AiProvider`, then registering it in `providers/index.ts`.
- Never edit `cloud.ts` or `local.ts` to accommodate a different backend.
- New model variants go into config arrays (`LOCAL_MODELS`, etc.), not `if/else` branches.

### Liskov Substitution

- `generate()` accepts `ChatMessage[]` + optional `GenerateOptions`, returns `Promise<string>`. Every implementation — cloud, local, anonymizing wrapper — must honor this exactly.
- Never throw implementation-specific errors that callers must special-case. Wrap llama.rn or API errors in a standard `Error` with a clear message.
- Decorators/wrappers (e.g. `anonymizingCloud.ts`) must satisfy `AiProvider` exactly. Pre/post-processing is invisible to callers.

### Interface Segregation

- `AiProvider` has one method: `generate()`. Never inflate it with tokenization, model management, or download logic.
- If a type is only used by one subsystem (e.g. BERT NER types), it belongs in that subsystem's own types file, not in the shared `features/ai/types.ts`.

### Dependency Inversion

- Screens and hooks call `getProvider()` from `providers/index.ts`. They never import `cloud.ts` or `local.ts` directly.
- If `features/ai/` needs Gmail data, it receives it as a parameter from the coordinating screen/hook — never by importing `features/gmail/` internals.

## Cross-Feature Coordination

- Features never import other features' internals directly.
- Coordination happens in the screen/hook layer. The screen receives data from feature A and passes it to feature B.
- Feature modules expose stable public APIs via `index.ts` barrel files. Consumers import from `features/gmail`, not from internal paths.

## Resource Lock (`ai/resourceLock.ts`)

- Coordinates on-device AI inference and Gmail network sync — only one active at a time to avoid OOM.
- Callers use `acquireAI()`/`releaseAI()` and `acquireNetwork()`/`releaseNetwork()`. Never check which provider is active or inspect RAM directly.

## Rate Limiting (Gmail)

- All Gmail API calls go through the centralized rate limiter (`lib/rateLimiter.ts`).
- Exponential backoff: base 1s, max 30s, 5 retries, Retry-After header support, jitter.

## Extending Features

- New React Query hooks go in new files — never add branches to existing hooks.
- New repository queries go in new files under `db/repositories/` — never bloat existing query files.
- New TTS voices, AI models, or label types go in data arrays, not conditional branches.
