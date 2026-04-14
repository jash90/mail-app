# Dependency Inversion Principle (DIP)

High-level modules depend on abstractions, not on low-level implementation details.

## Rules

- **Screens and hooks depend on `AiProvider`, never on `cloud.ts` or `local.ts` directly.** Call `getProvider()` to get the current implementation. The selection logic is centralized in `providers/index.ts` — UI code never makes that decision.
- **Data access goes through the repository layer.** Screens and hooks call `db/repositories/*` functions — they never import Drizzle query builders or `db/schema.ts` directly. The schema is an implementation detail of the repository.
- **Feature modules don't import from other features' internals.** If `features/ai/` needs Gmail data, it receives it as a parameter (injected by the screen/hook that coordinates both), not by importing `features/gmail/api.ts` directly. The coordination layer (screen or orchestrating hook) is responsible for wiring features together.
- **Third-party SDKs are wrapped.** Gmail API details live in `features/gmail/api.ts`. Sherpa ONNX details live in `features/tts/`. llama.rn details live in `features/ai/providers/local.ts`. No screen or shared hook ever imports `@react-native-google-signin` or `sherpa-onnx-react-native` directly.
- **Resource coordination uses abstract acquire/release, not implementation checks.** `resourceLock.ts` exposes `acquireAI()`/`acquireNetwork()` — callers don't check which provider is active or what the RAM situation is.

## How to check

Ask: "If I replace the low-level implementation (e.g. switch from Drizzle to Prisma, or from llama.rn to MLCEngine), which files change?" Only the wrapper/adapter should change — never screens, hooks, or other features.
