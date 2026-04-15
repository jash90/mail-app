# SOLID Principles — Project-Specific Rules

Detailed application of SOLID in this codebase. High-level summary is in root `AGENTS.md`.

## Single Responsibility (SRP)

- **One exported component per `.tsx` file.** No inline helpers, utility functions, or unrelated types alongside the component.
- **Feature modules own one domain.** `features/gmail/` owns Gmail API communication — it does not handle AI, TTS, or statistics. Cross-feature logic lives in a dedicated orchestration layer (`app/hooks/`), not buried inside a feature.
- **Feature-specific components live inside their feature.** A search filter component belongs in `features/search/components/`, not in the top-level `components/` directory.
- **Repository files handle one aggregate.** `db/repositories/threads/queries.ts` reads threads — it does not mutate them. Mutations live in `mutations.ts`.
- **Hooks do one thing.** A hook either manages UI state, or fetches data, or coordinates a side effect. If it does all three, split it.
- **Zustand stores own one slice of state.** `authStore` owns auth. `aiSettingsStore` owns AI settings. Don't add unrelated state to an existing store — create a new one.
- **Keep files under 500 lines.** If a file grows past this, it likely has more than one responsibility — split it.

## Open/Closed (OCP)

- **Extend via the `AiProvider` interface — don't modify existing providers.** Adding a new AI backend means creating a new file (e.g. `providers/ollama.ts`) that implements `AiProvider`, then registering it in `providers/index.ts`. Never edit `cloud.ts` or `local.ts` to accommodate a different backend.
- **Add new repository files instead of bloating existing ones.** Need a new query pattern for threads? Add a file in `db/repositories/threads/`, don't stuff it into `queries.ts`.
- **Feature modules expose stable public APIs via `index.ts` barrel files.** Consumers import from `features/gmail`, not from internal paths. Internal restructuring doesn't break callers.
- **New React Query hooks extend — don't patch.** Adding a new data-fetching pattern means a new hook file, not adding branches to an existing hook.
- **Configuration-driven behavior over conditionals.** When adding a new TTS voice, AI model, or label type — add an entry to the data array, don't add an `if/else` branch.

## Liskov Substitution (LSP)

- **All `AiProvider` implementations must honor the same contract.** `generate()` accepts `ChatMessage[]` + optional options, returns `Promise<string>`. Cloud, local, or any future wrapper — all behave identically from the caller's perspective.
- **Don't throw implementation-specific errors that callers must special-case.** If `local.ts` throws a llama.rn-specific error, wrap it in a standard `Error` with a clear message. Callers should never need `instanceof LlamaError` checks.
- **Decorators/wrappers preserve the base contract.** Any wrapper around an `AiProvider` must still satisfy `AiProvider` exactly. Pre/post-processing is invisible to the caller.
- **Repository functions with the same signature must be interchangeable.** Callers must not depend on subtle ordering or shape differences.

## Interface Segregation (ISP)

- **Keep interfaces small and focused.** `AiProvider` has one method: `generate()`. It does not bundle tokenization, model management, or download logic. Don't inflate it.
- **Split large type files by consumer.** If a type is only used by one subsystem (e.g. BERT NER types), it belongs in that subsystem's own types file, not in a shared `types.ts`.
- **Don't force callers to import what they don't need.** Barrel `index.ts` files should re-export selectively. If a consumer only needs `hybridSearch`, it shouldn't be forced to pull in FTS indexing internals.
- **Hook return types should be minimal.** A hook returns what the consuming component needs — not the entire internal state.
- **Repository functions accept only the parameters they need.** A query that needs a `threadId` takes `threadId: string`, not the full `Thread` object.

## Dependency Inversion (DIP)

- **Screens and hooks depend on `AiProvider`, never on `cloud.ts` or `local.ts` directly.** Call `getProvider()` to get the current implementation. The selection logic is centralized in `providers/index.ts`.
- **Data access goes through the repository layer.** Screens and hooks call `db/repositories/*` functions — they never import Drizzle query builders or `db/schema.ts` directly.
- **Feature modules don't import other features' internals.** Exception: Gmail explicitly re-exports `searchApi`, `statMessageExtractor`, and shared types via its barrel for search and stats features. All other cross-feature data flow goes through the screen/hook coordination layer.
- **Third-party SDKs are wrapped.** Gmail API details live in `features/gmail/api.ts`. Sherpa ONNX details live in `features/tts/`. llama.rn details live in `features/ai/providers/local.ts`. No screen or shared hook ever imports `@react-native-google-signin` or `sherpa-onnx-react-native` directly.
- **Resource coordination uses abstract acquire/release.** `lib/resourceLock.ts` exposes `acquireAI()`/`acquireNetwork()` — callers don't check which provider is active or what the RAM situation is.
