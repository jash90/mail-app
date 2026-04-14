# Interface Segregation Principle (ISP)

No module should be forced to depend on interfaces it doesn't use.

## Rules

- **Keep interfaces small and focused.** `AiProvider` has one method: `generate()`. It does not bundle tokenization, model management, or download logic. That's intentional — don't inflate it.
- **Split large type files by consumer.** `features/ai/types.ts` contains `AiProvider`, `ChatMessage`, `GenerateOptions`, `LocalModel`, `EmailContext` — separate concerns used by separate consumers. If a type is only used by one subsystem (e.g. BERT NER types), it belongs in that subsystem's own types file (e.g. `bert/bertTypes.ts`), not in the shared `types.ts`.
- **Don't force callers to import what they don't need.** Barrel `index.ts` files should re-export selectively. If a consumer only needs `hybridSearch`, it shouldn't be forced to pull in FTS indexing internals.
- **Hook return types should be minimal.** A hook returns what the consuming component needs — not the entire internal state. If a component only needs `isLoading` and `data`, the hook shouldn't also expose internal refs, retry functions, and cache keys.
- **Repository functions accept only the parameters they need.** A query function that needs a `threadId` takes `threadId: string`, not the full `Thread` object.

## How to check

Ask: "Does this consumer use everything it imports/receives?" If not, the interface is too wide.
