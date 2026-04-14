# Single Responsibility Principle (SRP)

Every module, file, and function has exactly one reason to change.

## Rules

- **One exported component per `.tsx` file.** No inline helpers, utility functions, or unrelated types alongside the component.
- **Feature modules own one domain.** `features/gmail/` owns Gmail API communication — it does not handle AI, TTS, or statistics. Cross-feature logic lives in a dedicated orchestration layer (hook, screen, or explicit bridge file), not buried inside a feature.
- **Repository files handle one aggregate.** `db/repositories/threads/queries.ts` reads threads — it does not mutate them. Mutations live in `mutations.ts`. Don't mix read and write concerns in a single file.
- **Hooks do one thing.** A hook either manages UI state, or fetches data, or coordinates a side effect. If it does all three, split it.
- **Zustand stores own one slice of state.** `authStore` owns auth. `aiSettingsStore` owns AI settings. Don't add unrelated state to an existing store — create a new one.
- **Keep files under 500 lines.** If a file grows past this, it likely has more than one responsibility — split it.

## How to check

Ask: "If requirement X changes, how many files do I touch?" If one change forces edits in unrelated files, a responsibility boundary is wrong.
