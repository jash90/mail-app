# AGENTS.md — Gmail Feature

<!-- Scope: Rules for features/gmail/ — Gmail API communication, sync, contacts, send/modify.
     Convention: Dev.to Feature-Based → features/gmail/ with components/ + hooks/ + services/. -->

## Domain

`features/gmail/` owns all Gmail API communication: thread/message CRUD, sync, batch parsing, contacts, labels, send, and modify. It does not handle AI inference, TTS, search ranking, or statistics computation.

## Cross-Feature Dependencies

Gmail is a foundational feature that both provides and consumes cross-feature imports:

| Direction | What | Via |
|-----------|------|-----|
| `gmail` → `auth` | OAuth token functions | `@/features/auth/oauthService` |
| `search` → `gmail` | `searchViaGmailApi` | `@/features/gmail/searchApi` |
| `gmail` → `search` | `hybridSearch`, `GenerateFn`, search types | `@/features/search` |
| `stats` → `gmail` | Batch functions + types | `@/features/gmail` barrel |

## Structure

```
features/gmail/
├── hooks/              # React hooks (React Query)
│   ├── useThreadQueries.ts
│   ├── useThreadMutations.ts
│   ├── useLabelsHook.ts
│   ├── useSendHooks.ts
│   ├── useSyncHooks.ts
│   ├── useSearchHooks.ts
│   └── useContactAutocomplete.ts
├── helpers/            # Services: pure utilities
│   ├── batch.ts        #   Multipart/mixed parsing
│   ├── address.ts
│   ├── encoding.ts
│   ├── mime.ts
│   └── text.ts
├── threads/            # Services: thread fetching & transformation
│   ├── fetch.ts
│   └── transform.ts
├── api.ts              # Service: authenticated Gmail API fetch
├── syncManager.ts      # Service: 2-min interval sync cycle
├── sync.ts             # Service: incremental + full sync logic
├── contacts.ts         # Service: contact extraction
├── labels.ts           # Service: label CRUD
├── messages.ts         # Service: message fetching & parsing
├── modify.ts           # Service: thread/message modification
├── send.ts             # Service: email sending
├── searchApi.ts        # Service: Gmail API search (public for search feature)
├── statMessageExtractor.ts  # Service: message extraction (public for stats feature)
├── queryKeys.ts        # React Query key factory
├── types.ts            # Feature-scoped types
└── index.ts            # Public barrel — re-exports public API
```

## Rules

- All Gmail API calls go through `lib/rateLimiter.ts` — never duplicate rate-limiting logic
- Sync must acquire `acquireNetwork()` from `lib/resourceLock.ts` during batch operations
- React Query keys are centralized in `queryKeys.ts` — never hardcode query keys elsewhere
- Batch API calls use multipart/mixed with custom boundary parsing (`helpers/batch.ts`)
- Repository access goes through `db/repositories/` — never import Drizzle query builders directly
