# AGENTS.md — Zustand Stores

<!-- Scope: Rules for store/ — Zustand state management.
     Source: CLAUDE.md state management section, .claude/rules/01 (SRP). -->

## One Store Per Slice

- Each store file owns exactly one slice of state.
- `authStore.ts` owns auth state. `aiSettingsStore.ts` owns AI settings. `polishVoiceStore.ts` owns TTS voice selection.
- Never add unrelated state to an existing store — create a new store file.

## Persistence

- Stores use SecureStore-backed persistence via Zustand middleware.
- Sensitive credentials (OAuth tokens) always go through `expo-secure-store`, never AsyncStorage or plain SQLite.

## Extending

- New state domain = new store file. Never extend an existing store with unrelated concerns.
