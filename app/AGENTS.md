# AGENTS.md — Screens & Routing

<!-- Scope: Rules for app/ — Expo Router screens, layouts, and navigation.
     Source: CLAUDE.md architecture section, .claude/rules/05 (DIP). -->

## Routing Structure (Expo Router — file-based)

| Path | Purpose |
|------|---------|
| `_layout.tsx` | Root: Buffer polyfill, Sentry init, DB migrations, auth guard (`Stack.Protected`), providers (PostHog → React Query → Stack) |
| `(tabs)/` | Bottom tabs: Inbox (`list.tsx`), Stats (`stats.tsx`), Settings (`settings.tsx`), Summary (`summary.tsx`) |
| `thread/[id].tsx` | Thread detail view |
| `compose.tsx` | Email compose with AI generation |
| `contact-tiers.tsx` | Contact importance tiers |
| `ai-tokens.tsx` | AI token usage dashboard |
| `login.tsx` | Google OAuth sign-in |

## Screen Responsibilities

- Screens are the **coordination layer**. They wire features together by receiving data from one feature and passing it to another.
- Screens depend on abstractions: call `getProvider()`, repository functions, `acquireAI()` — never import concrete implementations directly.
- Screens never import `@react-native-google-signin`, `sherpa-onnx-react-native`, or Drizzle query builders directly. Those are wrapped inside their respective feature/lib modules.

## Dependency Inversion at the Screen Level

- If a screen needs Gmail data for AI processing, it fetches Gmail data via `features/gmail` hooks and passes it to `features/ai` functions as parameters.
- Features don't import other features' internals. The screen is the bridge.

## Migrations

- Database migrations run automatically on app start in `_layout.tsx` via `useMigrations()`.
