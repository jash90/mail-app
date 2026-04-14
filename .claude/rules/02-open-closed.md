# Open/Closed Principle (OCP)

Modules are open for extension, closed for modification.

## Rules

- **Extend via the `AiProvider` interface — don't modify existing providers.** Adding a new AI backend (e.g. Ollama) means creating `providers/ollama.ts` that implements `AiProvider`, then registering it in `providers/index.ts`. Never edit `cloud.ts` or `local.ts` to accommodate a different backend.
- **Add new repository files instead of bloating existing ones.** Need a new query pattern for threads? Add a file in `db/repositories/threads/`, don't stuff it into `queries.ts`.
- **Feature modules expose stable public APIs via `index.ts` barrel files.** Consumers import from `features/gmail`, not from internal paths. Internal restructuring doesn't break callers.
- **New React Query hooks extend — don't patch.** Adding a new data-fetching pattern means a new hook file, not adding branches to an existing hook.
- **Configuration-driven behavior over conditionals.** When adding a new TTS voice, AI model, or label type — add an entry to the data array (`LOCAL_MODELS`, TTS voice list, etc.), don't add an `if/else` branch.

## How to check

Ask: "Can I add this new variant without editing existing, working code?" If no, the extension point is missing.
