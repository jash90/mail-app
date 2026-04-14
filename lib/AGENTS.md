# AGENTS.md — Shared Utilities

<!-- Scope: Rules for lib/ — shared utilities, SDK wrappers, cross-cutting concerns.
     Source: CLAUDE.md architecture section, .claude/rules/05 (DIP). -->

## Third-Party SDK Wrapping

- All third-party SDKs are wrapped in lib/ or their owning feature module. No screen or shared hook ever imports `@react-native-google-signin`, `sherpa-onnx-react-native`, or similar SDKs directly.
- `sentry.ts` wraps Sentry. `posthog.ts` wraps PostHog. `analytics.ts` provides event tracking abstractions.

## Rate Limiter (`rateLimiter.ts`)

- Centralized rate limiter shared across all Gmail API calls.
- Exponential backoff: base 1s, max 30s, 5 retries.
- Supports Retry-After header and jitter.
- Never duplicate rate-limiting logic in individual API call sites.

## Adding Utilities

- Utility files belong here only if they serve multiple features or screens.
- If a utility is specific to one feature, it belongs inside that feature module.
- Keep files under 500 lines.
