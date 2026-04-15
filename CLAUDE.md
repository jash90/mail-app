# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Architecture, conventions, and SOLID rules live in `AGENTS.md` (root) and subdirectory `AGENTS.md` files.**
> This file covers only development commands, tooling, and key configuration.

## Project Overview

React Native email client built with Expo SDK 54, connecting to Gmail API. Features: email reading/composing, AI summaries (cloud via Z.AI/OpenRouter or on-device via llama.rn), Polish TTS email reading (Sherpa ONNX), hybrid search (FTS + Gmail API + reranker), email statistics, and contact ranking. iOS-focused development build — Google Sign-In requires native modules so Expo Go won't work.

## Development Commands

```bash
bun start              # Start Expo dev server (Metro)
bun run ios            # Build and run on iOS simulator (development build)
bun run android        # Build and run on Android emulator
bun run lint           # ESLint (expo + prettier rules)
bun run format         # Prettier across app/, components/, features/, db/, lib/, config/, store/
bun run format:check   # Check formatting without writing
bun run typecheck      # tsc --noEmit
bun run check          # lint + typecheck together
bun run test           # Run all tests (Jest with jest-expo/ios preset)
bun run test -- --testPathPattern=<name>  # Run a single test file by name
bun run test:watch     # Watch mode
bunx drizzle-kit generate  # Generate migration from schema changes
bunx drizzle-kit push      # Push schema changes (dev only)
```

**Critical:** Always use `npx expo run:ios` or `bun run ios` for dev builds. `npx expo start` launches Expo Go which crashes on `RNGoogleSignin`.

## Key Configuration

- **Path alias:** `@/*` maps to project root (tsconfig paths)
- **Styling:** Tailwind CSS via UniWind (`global.css`, `uniwind-types.d.ts`)
- **React Compiler:** Enabled (`app.json` → `experiments.reactCompiler`)
- **Typed routes:** Enabled (Expo Router)
- **New Architecture:** Enabled (`app.json` → `newArchEnabled`)
- **Bundle IDs:** `com.jash.mail-app` (iOS), `com.jash.mailapp` (Android)
- **iOS deployment target:** 16.0 (enforced via custom plugin `plugins/withMinDeploymentTarget`)
- **Environment:** `EXPO_PUBLIC_ZAI_API_KEY`, `EXPO_PUBLIC_ZAI_MODEL`, `EXPO_PUBLIC_AI_BACKEND` (zai|openrouter), `EXPO_PUBLIC_OPENROUTER_API_KEY`, `EXPO_PUBLIC_OPENROUTER_MODEL`, `EXPO_PUBLIC_AI_TOKEN_TRACKING`, `EXPO_PUBLIC_LOCAL_MODELS_ENABLED`, `GOOGLE_IOS_URL_SCHEME`, `EXPO_PUBLIC_POSTHOG_API_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`, `EXPO_PUBLIC_SENTRY_DSN` in `.env`
- **Metro:** Custom config — buffer polyfill, `.sql` file imports, UniWind CSS, Sentry wrapping
- **Constants:** `config/constants.ts` — Gmail API URLs/quota units, AI model/backend config, rate limit params, Google Auth scopes
- **Lists:** Always use `@shopify/flash-list` instead of `FlatList`
- **Charts:** Use `victory-native` with `@shopify/react-native-skia` renderer

### Git Hooks (Lefthook)

Pre-commit: ESLint + Prettier (auto-fix) on staged `.ts/.tsx` files. Pre-push: typecheck + schema drift validation + tests (`--onlyChanged`).
