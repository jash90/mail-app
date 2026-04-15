# AGENTS.md — Stats Feature

<!-- Scope: Rules for features/stats/ — email statistics, contact ranking, batch fetching.
     Convention: Dev.to Feature-Based → features/stats/ with components/ + services/. -->

## Domain

`features/stats/` owns bulk email fetching from Gmail API, computing email statistics, and contact ranking/scoring. It does **not** handle AI inference, authentication, or Gmail mutations.

## Cross-Feature Dependencies

| Direction | What | Via |
|-----------|------|-----|
| `stats` → `gmail` | Batch functions + types (`GmailThread`, `GmailMessage`, `BatchPartResult`) | `@/features/gmail` barrel |

## Structure

```
features/stats/
├── hooks/                  # React hooks
│   (hooks at root level)
│   ├── hooks.ts            #   Ties fetch + compute together
│   ├── useContactImportance.ts  #   Contact importance scoring
├── batchFetcher.ts         # Service: Gmail API pagination with rate limiting
├── fetchAllMessages.ts     # Service: extracts stat data, writes to SQLite
├── helpers.ts              # Service: pure utility functions
├── types.ts                # EmailStats, ContactStats, ThreadLengthBucket, StatsProgress
└── index.ts                # Public barrel
```

## Architecture

1. **Batch fetcher** (`batchFetcher.ts`) — Gmail API pagination with rate limiting
2. **Message extraction** (`fetchAllMessages.ts`) — Extracts stat data, writes to SQLite
3. **Computation** (`db/repositories/stats/`) — Reads from SQLite, computes aggregations
4. **Hook** (`hooks.ts`) — Ties fetch + compute together with React state

## Components (currently in `components/stats/` + `components/summary/`)

Legacy — migrate on touch to `features/stats/components/`:

| Current location | Files |
|------------------|-------|
| `components/stats/` | `ContactRankingList.tsx`, `ProgressOverlay.tsx`, `ResponseTimeList.tsx`, `StatCard.tsx`, `ThreadLengthChart.tsx`, `TimeChart.tsx` |
| `components/summary/` | `PhaseBanner.tsx`, `SummaryHeader.tsx`, `SummaryItemRow.tsx` |

## Rules

- Stats computation runs against SQLite (offline), not Gmail API directly
- Gmail API calls go through `lib/rateLimiter.ts` and `lib/resourceLock.ts`
- `useEmailStats` acquires the network lock during batch fetching
- Never import AI or TTS modules from this feature
