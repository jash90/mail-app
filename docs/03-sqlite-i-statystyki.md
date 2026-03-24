# Część 3: SQLite, statystyki i tab navigation

**Commity:** `c1aa85e` → `a4abb32` → `0bb8822` → `da4ac9f` → `8544ac8` → `fdbed54`
**Zakres:** Drizzle ORM + SQLite, schema 8 tabel, migracja cache-first, batch stats, tab navigation, refactoring

---

## 3.1 Warstwa danych SQLite

**`c1aa85e`** chore: update dependencies (6 plików)
**`a4abb32`** feat: add SQLite database layer with Drizzle ORM (13 plików)

### Schema (`db/schema.ts`) — 8 tabel
- `threads` — wątki z indeksami na accountId, lastMessageAt, isRead
- `messages` — wiadomości z body (text/html), headerami, FK do threads (cascade delete)
- `participants` — deduplikacja po email z COALESCE na name
- `threadParticipants`, `messageRecipients` — relacje M:N
- `attachments`, `labels`, `syncState`

### Repositories (`db/repositories/`)
- **`threads.ts`** — batch upsert w transakcji, paginowane zapytania z SQL sorting
- **`messages.ts`** — upsert wiadomości z recipientami
- **`stats.ts`** — top senders/recipients via GROUP BY, dystrybucja godzinowa via strftime

## 3.2 Migracja Gmail na SQLite cache

**`0bb8822`** refactor: update Gmail feature with batch helpers and SQLite support (12 plików)

Zmiana architektury z API-first na cache-first:
```
Przed: useThreads() → listThreads() → Gmail API → UI
Po:    useThreads() → getThreadsPaginated(SQLite) → UI
       useSync()    → Gmail API → upsert SQLite → invalidate React Query
```

Dodano `helpers/batch.ts` — parser multipart/mixed odpowiedzi Gmail Batch API. Usunięto `persister.ts` (AsyncStorage) — SQLite przejął rolę persistence.

## 3.3 Moduł statystyk

**`da4ac9f`** feat: add email stats feature with batch message fetching (4 pliki)

`features/stats/fetchAllMessages.ts` — orkiestracja pobierania WSZYSTKICH wiadomości:
1. List all thread IDs z INBOX + SENT
2. Purge z DB wątków nieobecnych
3. Filter stale (>24h) → batch fetch po 100
4. Retry rounds z exponential backoff (4s, 8s, 16s)

## 3.4 Tab navigation i nowe komponenty

**`8544ac8`** feat: restructure app with tab navigation and new components (22 pliki)

Zamiana flat stack na bottom tabs (`app/(tabs)/`): Inbox, Stats, Settings.

Nowe komponenty: `StatCard`, `ContactRankingList`, `TimeChart`, `ThreadLengthChart`, `ProgressOverlay`, `ListSkeleton`, `SkeletonRow`, `StatsSkeleton`.

Wyodrębniono `lib/emailHtml.ts` (dark theme WebView wrapper) i `lib/formatDate.ts`.

## 3.5 Refactoring

**`fdbed54`** refactor: simplify thread screen (3 pliki)

- Ekstrakcja `ThreadMessageItem` — memoizowany komponent z stabilnym callback
- Ekstrakcja `parseCompositeId` do `lib/`
- Fix `useEffect` z brakującą zależnością
- Optymalizacja DB: `findMatchingProviderThreadIds` helper, median w SQL zamiast JS, bulk delete zamiast pętli
