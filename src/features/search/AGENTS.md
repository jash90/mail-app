# AGENTS.md — Search Feature

<!-- Scope: Rules for features/search/ — hybrid search, Gmail API search, BM25 reranking.
     Convention: Dev.to Feature-Based → features/search/ with components/ + services/. -->

## Domain

`features/search/` owns hybrid email search combining local FTS5 index with Gmail API search and BM25 reranking. It does **not** handle direct Gmail mutations, AI inference, or TTS.

## Cross-Feature Dependencies

| Direction | What | Via |
|-----------|------|-----|
| `search` → `gmail` | `searchViaGmailApi` | `@/features/gmail/searchApi` |
| `gmail` → `search` | `hybridSearch`, `GenerateFn`, search types | `@/features/search` |

Bidirectional with gmail: search uses gmail's API, gmail uses search's ranking.

## Structure

```
features/search/
├── hybridSearch.ts     # Service: merges FTS5 + Gmail API results with BM25 reranking
├── reranker.ts         # Service: BM25 scoring with optional AI reranking
├── types.ts            # SearchParams, SearchResult, QuickFilters, FTSMatch
└── index.ts            # Public barrel
```

## Architecture

1. **FTS5 index** (`db/repositories/search/`) — Local SQLite full-text search
2. **Gmail API search** — Uses `searchViaGmailApi` from `features/gmail`
3. **Hybrid merge** (`hybridSearch.ts`) — Combines local + remote, deduplicates
4. **Reranker** (`reranker.ts`) — BM25 + optional AI reranking

## Components (currently in `components/search/`)

Legacy — migrate on touch to `features/search/components/`:

| Current location | Files |
|------------------|-------|
| `components/search/` | `FilterChip.tsx`, `SearchFilters.tsx`, `SearchInput.tsx`, `SearchModal.tsx`, `SearchResults.tsx`, `filterHelpers.ts`, `useSearchFilters.ts` |

## Rules

- Search never modifies Gmail data — it only reads
- FTS indexing is triggered by sync, not by search itself
- `searchViaGmailApi` goes through the centralized rate limiter (handled in gmail feature)
- Never import AI or TTS modules from this feature directly
- Reranking receives a `GenerateFn` injection (Dependency Inversion) — no direct AI provider import
