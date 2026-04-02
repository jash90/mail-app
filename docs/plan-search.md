# Plan: Kontekstowe wyszukiwanie emaili — Hybrid (FTS5 + AI Reranking)

## 🎯 Cel

Wyszukiwanie kontekstowe: użytkownik wpisuje naturalną frazę (np. "faktura od Kowalskiego z zeszłego miesiąca"),
system przeszukuje **wszystkie dostępne metadane** (subject, snippet, nadawca, odbiorcy, labels, daty, flagi)
przez FTS5 z BM25 rankingiem, a opcjonalnie AI reranker ocenia semantyczną trafność wyników.

Dodatkowo: szybkie filtry checkboxowe do zawężania bez pisania.

## 🏗️ Architektura

```
┌───────────────────────────────────────────────────────┐
│  list.tsx (Inbox)                                      │
│  ┌─────────────┐                                      │
│  │ 🔍 Ikona    │ ──onPress──→ otwiera modal           │
│  └─────────────┘                                      │
└───────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────┐
│  SearchModal.tsx (Modal fullscreen)                    │
│  ┌─────────────────────────────────────────────────┐  │
│  │ 🔍 TextInput — wyszukiwanie kontekstowe         │  │
│  │    "faktura od kowalskiego z marca"              │  │
│  ├─────────────────────────────────────────────────┤  │
│  │ Quick Filters (checkboxy):                      │  │
│  │                                                  │  │
│  │  Stan:     ☐ Nieprzeczytane  ☐ Oznaczone ⭐     │  │
│  │  Typ:      ☐ Newsletter      ☐ Auto-reply       │  │
│  │  Czas:     ○ Tydzień  ○ Miesiąc  ○ Rok  ○ Wszystko│ │
│  │  Label:    [chips: INBOX, SENT, STARRED, ...]   │  │
│  │  🤖 AI Reranking [toggle]                       │  │
│  ├─────────────────────────────────────────────────┤  │
│  │ 12 wyników                                      │  │
│  │ ┌────────────────────────────────────────────┐  │  │
│  │ │ EmailComponent (reużyty z importanceMap)   │  │  │
│  │ │ EmailComponent                              │  │  │
│  │ │ ...                                         │  │  │
│  │ └────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────┐
│  Hybrid Search Pipeline                                │
│                                                        │
│  Krok 1: FTS5 MATCH na WSZYSTKICH metadanych (<50ms)  │
│  ┌──────────────────────────────────────────────────┐ │
│  │  email_fts (VIRTUAL TABLE fts5)                  │ │
│  │  Kolumny indeksowane:                            │ │
│  │   • subject        (temat wiadomości)            │ │
│  │   • snippet        (fragment treści)             │ │
│  │   • from_name      (nazwa nadawcy)               │ │
│  │   • from_email     (email nadawcy)               │ │
│  │   • to_emails      (odbiorcy: to/cc)             │ │
│  │   • label_names    (nazwy labeli, space-sep)     │ │
│  │  → BM25 ranking, tokenize='unicode61'            │ │
│  └──────────────────────────────────────────────────┘ │
│           │                                            │
│           ▼                                            │
│  Krok 2: Quick Filters (SQL WHERE na threads)         │
│  ┌──────────────────────────────────────────────────┐ │
│  │  → isUnread, isStarred, isNewsletter, isAutoReply│ │
│  │  → dateFrom (tydzień/miesiąc/rok)                │ │
│  │  → labelIds (wybrane chips)                      │ │
│  └──────────────────────────────────────────────────┘ │
│           │                                            │
│           ▼                                            │
│  Krok 3: AI Reranking (opcjonalny)                    │
│  ┌──────────────────────────────────────────────────┐ │
│  │  → llama.rn / Z.AI (aktualny provider)           │ │
│  │  → Prompt z query + kandydatami                  │ │
│  │  → Semantic relevance score 0-10                 │ │
│  │  → Final = 0.4 * norm(FTS) + 0.6 * norm(AI)     │ │
│  └──────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

## 📊 Dane w indeksie FTS5

Wszystkie metadane dostępne w SQLite, które trafiają do indeksu:

| Kolumna FTS | Źródło | Przykład |
|-------------|--------|---------|
| `subject` | `threads.subject` | "Faktura nr 2025/03/142" |
| `snippet` | `threads.snippet` | "W załączeniu przesyłam fakturę za..." |
| `from_name` | `participants.name` (first participant) | "Jan Kowalski" |
| `from_email` | `participants.email` (first participant) | "jan.kowalski@firma.pl" |
| `to_emails` | `messageRecipients` (to+cc, space-sep) | "anna@example.com biuro@firma.pl" |
| `label_names` | `threadLabels` → `labels.name` (space-sep) | "INBOX IMPORTANT praca" |

> `thread_id` jest kolumną `UNINDEXED` — służy tylko do joinowania wyników z tabelą `threads`.

## 📁 Pliki do utworzenia / zmodyfikowania

| # | Plik | Akcja | Opis |
|---|------|-------|------|
| 1 | `drizzle/XXXX_add_email_fts.sql` | **NEW** | Migracja — FTS5 virtual table + triggery |
| 2 | `db/repositories/search.ts` | **NEW** | `searchFTS()`, `rebuildFTSIndex()`, `updateFTSEntry()` |
| 3 | `db/repositories/threads.ts` | **EDIT** | Dodać `searchThreadsWithFilters()` — quick filters na wynikach FTS |
| 4 | `features/search/hybridSearch.ts` | **NEW** | Pipeline: FTS5 → quick filters → AI reranking |
| 5 | `features/search/reranker.ts` | **NEW** | AI reranking via `getProvider()` (llama.rn / Z.AI) |
| 6 | `features/search/types.ts` | **NEW** | `SearchFilters`, `QuickFilters`, `SearchResult` |
| 7 | `features/gmail/queryKeys.ts` | **EDIT** | Dodać klucz `search` |
| 8 | `features/gmail/hooks.ts` | **EDIT** | Dodać `useSearchThreads()` hook |
| 9 | `features/gmail/index.ts` | **EDIT** | Wyeksportować nowy hook |
| 10 | `components/SearchModal.tsx` | **NEW** | Modal: search input + quick filters + wyniki |
| 11 | `app/(tabs)/list.tsx` | **EDIT** | Ikona 🔍 + state modala |

## 🔧 Szczegóły implementacji

### 1. FTS5 Virtual Table — migracja

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS email_fts USING fts5(
  thread_id UNINDEXED,
  subject,
  snippet,
  from_name,
  from_email,
  to_emails,
  label_names,
  tokenize='unicode61'
);
```

Triggery na `threads` (insert/update/delete) + `rebuildFTSIndex()` do pełnego
przebudowania z joinami na `participants`, `messageRecipients`, `labels`.

### 2. `features/search/types.ts`

```typescript
/** Filtry checkboxowe — szybkie zawężanie wyników */
export interface QuickFilters {
  isUnread?: boolean;       // ☐ Nieprzeczytane
  isStarred?: boolean;      // ☐ Oznaczone ⭐
  isNewsletter?: boolean;   // ☐ Newsletter
  isAutoReply?: boolean;    // ☐ Auto-reply
  timeRange?: 'week' | 'month' | 'year' | 'all';  // ○ Radio group
  labelIds?: string[];      // Chips z labeli
}

/** Pełny zestaw parametrów wyszukiwania */
export interface SearchParams {
  query: string;            // Fraza kontekstowa (FTS5 MATCH)
  filters: QuickFilters;
  useAI: boolean;           // AI reranking toggle
}

/** Pojedynczy wynik wyszukiwania */
export interface SearchResult {
  thread: EmailThread;
  ftsScore: number;         // BM25 rank (niższy = lepszy)
  aiScore?: number;         // 0-10 relevance od AI
  finalScore: number;       // Wynik złożony do sortowania
}
```

### 3. `db/repositories/search.ts`

```typescript
/** FTS5 full-text search — zwraca threadIds z BM25 rank. */
function searchFTS(query: string, limit?: number): { threadId: string; rank: number }[]

/**
 * Przebuduj cały indeks FTS z aktualnych danych.
 * Joinuje threads + participants + messageRecipients + labels.
 * Wywoływany po sync.
 */
function rebuildFTSIndex(accountId: string): void

/** Aktualizuj wpis FTS dla pojedynczego threada (po upsert). */
function updateFTSEntry(threadId: string): void
```

### 4. `searchThreadsWithFilters()` w threads.ts

Bierze listę threadIds z FTS5 i nakłada quick filters:

```typescript
function searchThreadsWithFilters(
  accountId: string,
  threadIds: string[],      // z FTS5
  filters: QuickFilters,
): EmailThread[]
```

SQL:
- `isUnread` → `WHERE is_read = 0`
- `isStarred` → `WHERE is_starred = 1`
- `isNewsletter` → `WHERE is_newsletter = 1`
- `isAutoReply` → `WHERE is_auto_reply = 1`
- `timeRange: 'week'` → `WHERE last_message_at > datetime('now', '-7 days')`
- `timeRange: 'month'` → `WHERE last_message_at > datetime('now', '-1 month')`
- `timeRange: 'year'` → `WHERE last_message_at > datetime('now', '-1 year')`
- `labelIds` → `JOIN threadLabels WHERE labelId IN (...)`
- Reużywa `hydrateThreads()` do pobrania participants + labels

### 5. `features/search/hybridSearch.ts`

```typescript
async function hybridSearch(
  accountId: string,
  params: SearchParams,
): Promise<SearchResult[]> {
  // 1. FTS5 — preselekcja 50 kandydatów z BM25
  const ftsResults = searchFTS(params.query, 50);

  // 2. Quick filters — SQL WHERE na threads
  const threadIds = ftsResults.map(r => r.threadId);
  const filtered = searchThreadsWithFilters(accountId, threadIds, params.filters);

  // 3. Mapuj FTS scores
  const ftsMap = new Map(ftsResults.map(r => [r.threadId, r.rank]));
  let results: SearchResult[] = filtered.map(thread => ({
    thread,
    ftsScore: ftsMap.get(thread.id) ?? 0,
    finalScore: ftsMap.get(thread.id) ?? 0,
  }));

  // 4. AI reranking (opcjonalny)
  if (params.useAI && results.length > 0) {
    const aiScores = await rerankCandidates(params.query, results);
    results = results.map(r => ({
      ...r,
      aiScore: aiScores.get(r.thread.id) ?? 5,
      finalScore: 0.4 * normalize(r.ftsScore) + 0.6 * (aiScores.get(r.thread.id) ?? 5) / 10,
    }));
  }

  // 5. Sortuj i zwróć top 20
  return results.sort((a, b) => b.finalScore - a.finalScore).slice(0, 20);
}
```

### 6. `features/search/reranker.ts`

```typescript
async function rerankCandidates(
  query: string,
  candidates: SearchResult[],
): Promise<Map<string, number>> {
  const provider = getProvider(); // llama.rn lub Z.AI

  const prompt = buildRerankPrompt(query, candidates.slice(0, 15));
  const response = await provider.generate([
    { role: 'system', content: RERANK_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ]);

  return parseRerankResponse(response, candidates);
}
```

Prompt pattern:
```
Search query: "{query}"

Rate each email's relevance to the query (0-10). Consider subject, sender, preview text, and labels.
Return ONLY a JSON array of scores in order: [score1, score2, ...]

Emails:
1. Subject: "Faktura nr 2025/03" | From: Jan Kowalski <jan@firma.pl> | Preview: "W załączeniu..." | Labels: INBOX, IMPORTANT
2. Subject: "Meeting tomorrow" | From: Anna Nowak <anna@corp.com> | Preview: "Hi, let's..." | Labels: INBOX
...
```

### 7. `useSearchThreads()` hook

```typescript
export const useSearchThreads = (accountId: string, params: SearchParams) =>
  useQuery({
    queryKey: gmailKeys.search(accountId, params),
    queryFn: () => hybridSearch(accountId, params),
    enabled: !!accountId && params.query.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
```

Debounce 300ms zarządzany w `SearchModal` (stan lokalny → debouncedQuery → hook).

### 8. `SearchModal.tsx` — UI

```
┌────────────────────────────────────────────────┐
│ ✕                     Szukaj                   │
├────────────────────────────────────────────────┤
│ 🔍 [faktura od kowalskiego____________]       │
├────────────────────────────────────────────────┤
│                                                │
│  ☐ Nieprzeczytane        ☐ Oznaczone ⭐        │
│  ☐ Newsletter            ☐ Auto-reply          │
│                                                │
│  Okres:                                        │
│  ┌──────┐ ┌────────┐ ┌─────┐ ┌──────────┐    │
│  │ 7 dni│ │ Miesiąc│ │ Rok │ │ Wszystko │    │
│  └──────┘ └────────┘ └─────┘ └──────────┘    │
│                                                │
│  Labels:                                       │
│  [INBOX] [SENT] [STARRED] [IMPORTANT] [+]     │
│                                                │
│  🤖 Smart ranking                  [toggle]   │
│                                                │
├────────────────────────────────────────────────┤
│ 12 wyników                                     │
│ ┌──────────────────────────────────────────┐  │
│ │ EmailComponent — Faktura nr 2025/03      │  │
│ │ EmailComponent — RE: Płatność za usługi  │  │
│ │ EmailComponent — ...                      │  │
│ └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

**Komponenty UI:**
- `TextInput` z debounce 300ms → `debouncedQuery`
- **Checkboxy** (`Pressable` + ikona) — toggle state per filtr
- **Radio group** okresu — `Pressable` chips z aktywnym stanem (bg-white text-black vs bg-white/10 text-white)
- **Label chips** — `ScrollView horizontal` z `Pressable` toggles, dane z `useLabels()`
- **AI toggle** — `Switch` z etykietą "Smart ranking"
- **FlashList** wyników — reużywa `EmailComponent` + `threadToEmailProps`
- Tapnięcie wyniku → `router.push('/thread/[id]')` + `onClose()`

**Stan modala:**
```typescript
const [query, setQuery] = useState('');
const [debouncedQuery] = useDebounce(query, 300);
const [filters, setFilters] = useState<QuickFilters>({});
const [useAI, setUseAI] = useState(false);
```

## ⚡ Kolejność implementacji

```
Krok 1:  features/search/types.ts                 (typy)
Krok 2:  Migracja FTS5 + triggery                 (baza danych)
Krok 3:  db/repositories/search.ts                (warstwa FTS5)
Krok 4:  searchThreadsWithFilters() w threads.ts  (quick filters)
Krok 5:  features/search/reranker.ts              (AI reranking)
Krok 6:  features/search/hybridSearch.ts           (orkiestracja pipeline)
Krok 7:  queryKey + useSearchThreads()             (hook React Query)
Krok 8:  components/SearchModal.tsx                (UI modala)
Krok 9:  Integracja w list.tsx                     (ikona + modal)
Krok 10: rebuildFTSIndex() w sync flow             (utrzymanie indeksu)
```

## 🎯 Zakres

**Wdrażamy:**
- ✅ FTS5 virtual table na WSZYSTKICH metadanych (subject, snippet, from, to, labels)
- ✅ Wyszukiwanie kontekstowe — naturalne frazy z BM25 rankingiem
- ✅ Quick filters: nieprzeczytane, oznaczone, newsletter, auto-reply
- ✅ Time range: 7 dni / miesiąc / rok / wszystko
- ✅ Label chips — filtrowanie po labelach
- ✅ AI reranking via aktualny provider (llama.rn / Z.AI) — opcjonalny toggle
- ✅ Pipeline: FTS5 preselekcja → quick filters → AI rerank → sorted results
- ✅ Modal fullscreen z FlashList (reużycie EmailComponent)
- ✅ Rebuild FTS po każdym sync

**Rozszerzenia (poza scope):**
- 🔮 FTS5 na `body_text` wiadomości (pełna treść)
- 🔮 Vector embeddings + cosine similarity (pełny RAG)
- 🔮 Historia wyszukiwań
- 🔮 Saved searches / smart folders
- 🔮 Gmail API search fallback (`q=` parameter)
