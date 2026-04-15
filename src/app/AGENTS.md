# AGENTS.md — Screens & Routing

<!-- Scope: Rules for app/ — Expo Router screens, layouts, and navigation.
     In Dev.to Feature-Based pattern, screens live in features/*/screens/.
     Expo Router requires all routes in app/ — this is the adaptation. -->

## Routing Structure

| Path | Purpose |
|------|---------|
| `_layout.tsx` | Root: Buffer polyfill, Sentry init, DB migrations, auth guard, providers |
| `index.tsx` | Root redirect to inbox |
| `(tabs)/_layout.tsx` | Tab navigator layout |
| `(tabs)/list.tsx` | Inbox — threads list |
| `(tabs)/stats.tsx` | Statistics dashboard |
| `(tabs)/settings.tsx` | Settings |
| `(tabs)/summary.tsx` | AI summaries |
| `thread/[id].tsx` | Thread detail view |
| `compose.tsx` | Email compose with AI generation |
| `contact-tiers.tsx` | Contact importance tiers |
| `ai-tokens.tsx` | AI token usage dashboard |
| `login.tsx` | Google OAuth sign-in |

## Screen Responsibilities

Screens are **thin route wrappers** — the coordination layer that wires features together:

- Import components from `features/<name>/components/` (or `components/` for legacy)
- Import hooks from `features/<name>/hooks/`
- Wire features together by receiving data from one feature and passing it to another
- Never import third-party SDKs, Drizzle query builders, or concrete AI implementations directly

## Screen-Level Hooks (`app/hooks/`)

These orchestrate multiple features and belong at the app layer, not inside features:

| Hook | Purpose |
|------|---------|
| `useInboxScreen` | Inbox: sync, threads, labels, selection, batch ops, TTS, AI prefetch |
| `useThreadScreen` | Thread detail: messages, reply, AI reply generation, mark-as-read |

## Migrations

- Database migrations run automatically on app start in `_layout.tsx` via `useMigrations()` (re-exported from `db/migrate.ts`)
