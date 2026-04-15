# AGENTS.md — Auth Feature

<!-- Scope: Rules for features/auth/ — Google OAuth, token lifecycle.
     Convention: Dev.to Feature-Based → features/auth/ with services/. -->

## Domain

`features/auth/` owns Google Sign-In, OAuth token storage, and token refresh. It wraps `@react-native-google-signin` so no other module imports it directly. It is a **foundational feature** — gmail depends on it for API authentication.

## Cross-Feature Dependencies

`gmail` imports `oauthService` functions directly. This is the only permitted cross-feature import of auth (all other features get auth state through `store/authStore`).

## Structure

```
features/auth/
├── oauthService.ts     # Service: sign-in, token refresh, SecureStore persistence
└── index.ts            # Public barrel
```

## Public API

Consumers import from `features/auth` (barrel `index.ts`), never from `oauthService.ts` directly.

- `signInWithGoogle()` — Interactive sign-in, returns user + access token
- `initializeTokens()` — Restore/refresh tokens on app start
- `resetTokens()` — Clear stored OAuth tokens (logout)
- `ensureGoogleSignInConfigured()` — Idempotent GoogleSignin SDK setup
- `resetGoogleSignInConfig()` — Reset config flag on logout

## Token Lifecycle

- Tokens stored in `expo-secure-store` via `StoredTokens` interface
- Access tokens refreshed via `GoogleSignin.getTokens()` (not OAuth refresh endpoint)
- 60-second expiry buffer (`TOKEN_EXPIRY_BUFFER_MS`)
- 1-hour token lifetime (`TOKEN_LIFETIME_MS`)

## Rules

- Never import `@react-native-google-signin` outside this module
- Never store OAuth tokens in AsyncStorage or plain SQLite — always use SecureStore
- `GoogleSignin.configure()` must be called before any API usage; `ensureGoogleSignInConfigured()` handles this
