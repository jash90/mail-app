# Plan: Wyszukiwanie emaili — Hybrid (FTS5 + AI Reranking) z modalem

## 🏗️ Architektura

```
┌─────────────────────────────────────────────────┐
│  list.tsx (Inbox)                                │
│  ┌─────────────┐                                │
│  │ 🔍 Ikona    │ ──onPress──→ otwiera modal     │
│  └─────────────┘                                │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│  SearchModal.tsx (Modal fullscreen)              │
│  ┌─────────────────────────────────────────┐    │
│  │ TextInput — szybkie wyszukiwanie        │    │
│  ├─────────────────────────────────────────┤    │
│  │ Filtry metadanych (rozwijane):          │    │
│  │  • Od (nadawca email/nazwa)             │    │
│  │  • Do (odbiorca)                        │    │
│  │  • Temat (subject)                      │    │
│  │  • Label (INBOX, STARRED, user labels)  │    │
│  │  • Data od / Data do                    │    │
│  │  • Nieprzeczytane / Oznaczone gwiazdką  │    │
│  │  • Newsletter / Auto-reply              │    │
│  │  • 🤖 AI Reranking toggle              │    │
│  ├─────────────────────────────────────────┤    │
│  │ FlashList — wyniki wyszukiwania         │    │
│  │  (reużywa EmailComponent)               │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Warstwa wyszukiwania (Hybrid)                               │
│                                                              │
│  Krok 1: FTS5 preselekcja (~50 kandydatów, <50ms)           │
│  ┌────────────────────────────────────────────────────┐     │
│  │  email_fts (VIRTUAL TABLE fts5)                    │     │
│  │  → subject, snippet, from_name, from_email         │     │
│  │  → BM25 ranking                                    │     │
│  │  → tokenize='unicode61' (polskie znaki)            │     │
│  └────────────────────────────────────────────────────┘     │
│           │                                                  │
│           ▼                                                  │
│  Krok 2: Filtry metadanych (SQL WHERE)                      │
│  ┌────────────────────────────────────────────────────┐     │
│  │  → labelIds, dateFrom/dateTo, isUnread, isStarred  │     │
│  │  → fromEmail, toEmail (JOIN participants/recipients)│     │
│  │  → isNewsletter, isAutoReply                       │     │
│  └────────────────────────────────────────────────────┘     │
│           │                                                  │
│           ▼                                                  │
│  Krok 3: AI Reranking (opcjonalny, llama.rn)               │
│  ┌────────────────────────────────────────────────────┐     │
│  │  → Kandydaci z FTS5 → prompt → relevance score     │     │
│  │  → Merge FTS score + AI score → final ranking      │     │
│  │  → Włączany togglem w UI                           │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│  Warstwa danych                                  │
│                                                  │
│  db/repositories/threads.ts                      │
│   └─ searchThreads(accountId, filters)           │
│      → FTS5 + dynamiczne WHERE                   │
│      → reużywa hydrateThreads()                  │
│                                                  │
│  features/search/hybridSearch.ts                 │
│   └─ hybridSearch(accountId, query, options)     │
│      → FTS5 preselekcja → AI reranking           │
│                                                  │
│  features/gmail/hooks.ts                         │
│   └─ useSearchThreads(accountId, filters)        │
│      → useQuery z debounce 300ms                 │
│                                                  │
│  features/gmail/queryKeys.ts                     │
│   └─ search: (accountId, filters) => [...]       │
└─────────────────────────────────────────────────┘
```

## 📁 Pliki do utworzenia / zmodyfikowania

| # | Plik | Akcja | Opis |
|---|------|-------|------|
| 1 | `drizzle/XXXX_add_email_fts.sql` | **NEW** | Migracja — FTS5 virtual table + triggery sync |
| 2 | `db/repositories/search.ts` | **NEW** | `searchFTS()`, `rebuildFTSIndex()` — warstwa dostępu FTS5 |
| 3 | `db/repositories/threads.ts` | **EDIT** | Dodać `searchThreads()` — filtry metadanych na wynikach FTS |
| 4 | `features/search/hybridSearch.ts` | **NEW** | Orkiestracja: FTS5 → filtry → AI reranking |
| 5 | `features/search/reranker.ts` | **NEW** | AI reranking via llama.rn / Z.AI |
| 6 | `features/gmail/queryKeys.ts` | **EDIT** | Dodać klucz `search` |
| 7 | `features/gmail/hooks.ts` | **EDIT** | Dodać `useSearchThreads()` hook |
| 8 | `features/gmail/index.ts` | **EDIT** | Wyeksportować nowy hook |
| 9 | `components/SearchModal.tsx` | **NEW** | Komponent modala wyszukiwania |
| 10 | `app/(tabs)/list.tsx` | **EDIT** | Dodać ikonę 🔍 w headerze + state modala |

## 🔧 Szczegóły implementacji

### 1. FTS5 Virtual Table — migracja SQL

```sql
-- Virtual table do full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS email_fts USING fts5(
  thread_id UNINDEXED,
  subject,
  snippet,
  from_name,
  from_email,
  tokenize='unicode61'
);

-- Trigger: nowy thread → wstaw do FTS
CREATE TRIGGER IF NOT EXISTS trg_threads_fts_insert
AFTER INSERT ON threads
BEGIN
  INSERT INTO email_fts(thread_id, subject, snippet, from_name, from_email)
  SELECT NEW.id, NEW.subject, NEW.snippet, '', '';
END;

-- Trigger: update thread → aktualizuj FTS
CREATE TRIGGER IF NOT EXISTS trg_threads_fts_update
AFTER UPDATE OF subject, snippet ON threads
BEGIN
  DELETE FROM email_fts WHERE thread_id = OLD.id;
  INSERT INTO email_fts(thread_id, subject, snippet, from_name, from_email)
  SELECT NEW.id, NEW.subject, NEW.snippet, '', '';
END;

-- Trigger: delete thread → usuń z FTS
CREATE TRIGGER IF NOT EXISTS trg_threads_fts_delete
AFTER DELETE ON threads
BEGIN
  DELETE FROM email_fts WHERE thread_id = OLD.id;
END;
```

> **Uwaga:** `from_name` i `from_email` w triggerach są puste, bo
> dane nadawcy żyją w `participants`/`threadParticipants`. Kolumny FTS
> wypełniane są przez `rebuildFTSIndex()` (full rebuild) lub
> aktualizowane w `upsertThreads()` po batch upsert.

### 2. `db/repositories/search.ts` — warstwa FTS5

```typescript
interface FTSResult {
  threadId: string;
  rank: number;  // BM25 score (lower = more relevant)
}

/** FTS5 full-text search z BM25 ranking. */
function searchFTS(query: string, limit: number = 50): FTSResult[]

/** Rebuild FTS index z aktualnych danych (po sync). */
function rebuildFTSIndex(accountId: string): void

/** Populate FTS from_name/from_email po upsert threads. */
function updateFTSParticipants(threadIds: string[]): void
```

### 3. `searchThreads()` — filtry metadanych

```typescript
interface SearchFilters {
  query?: string;          // FTS5 query (subject + snippet + nadawca)
  fromEmail?: string;      // filtr po nadawcy
  toEmail?: string;        // filtr po odbiorcy
  subject?: string;        // filtr po temacie
  labelIds?: string[];     // filtr po labelach
  dateFrom?: string;       // ISO date
  dateTo?: string;         // ISO date
  isUnread?: boolean;
  isStarred?: boolean;
  isNewsletter?: boolean;
  isAutoReply?: boolean;
  limit?: number;
  offset?: number;
}
```

**Strategia SQL:**
- `query` → FTS5 MATCH z BM25 ranking (zamiast LIKE — szybsze i lepszy ranking)
- `fromEmail` → `JOIN participants` + `LIKE` na email nadawcy
- `toEmail` → `JOIN messageRecipients` na typ `to`
- `labelIds` → `JOIN threadLabels` + `IN (...)`
- `dateFrom/dateTo` → `WHERE last_message_at BETWEEN`
- Flagi boolean → proste `WHERE` na kolumnach threads
- **Reużywa istniejące** `hydrateThreads()` do pobrania participants + labels

### 4. `features/search/hybridSearch.ts` — orkiestracja

```typescript
interface HybridSearchOptions {
  useAI?: boolean;       // włącz AI reranking (domyślnie false)
  ftsLimit?: number;     // ile kandydatów z FTS5 (domyślnie 50)
  finalLimit?: number;   // ile wyników zwrócić (domyślnie 20)
}

interface SearchResult {
  thread: EmailThread;
  ftsScore: number;
  aiScore?: number;
  finalScore: number;
}

/**
 * Hybrid search pipeline:
 * 1. FTS5 preselekcja → kandydaci z BM25 score
 * 2. Filtry metadanych → zawężenie wyników
 * 3. (opcjonalnie) AI reranking → semantic relevance
 */
async function hybridSearch(
  accountId: string,
  filters: SearchFilters,
  options?: HybridSearchOptions
): Promise<SearchResult[]>
```

### 5. `features/search/reranker.ts` — AI reranking

```typescript
/**
 * AI reranking — llama.rn lub Z.AI ocenia trafność kandydatów.
 * Używa aktualnie wybranego AI providera z aiSettingsStore.
 *
 * Prompt pattern:
 *   "Given search query: '{query}'
 *    Rate each email's relevance (0-10):
 *    1. [Subject] from sender — snippet
 *    2. ..."
 *
 * Zwraca scores zmapowane na threadId.
 */
async function rerankCandidates(
  query: string,
  candidates: { threadId: string; subject: string; from: string; snippet: string }[],
): Promise<Map<string, number>>
```

### 6. `useSearchThreads()` — hook

- `useQuery` z `enabled: hasAnyFilter` (nie odpala pustego query)
- **Debounce 300ms** na `query` tekst — stan lokalny w modalu, przekazanie do hooka po debounce
- `staleTime: 5min` — wyniki wyszukiwania nie muszą być ultra-świeże
- `queryKey: gmailKeys.search(accountId, serializedFilters)`
- Gdy `useAI: true` → `queryFn` wywołuje `hybridSearch()` z AI rerankingiem

### 7. `SearchModal.tsx` — UI

```
┌────────────────────────────────────────┐
│ ✕ Zamknij          Szukaj             │
├────────────────────────────────────────┤
│ 🔍 [________________________] szybkie │
├────────────────────────────────────────┤
│ ▶ Filtry zaawansowane                  │  ← Pressable toggle
│   Od:    [________________]            │
│   Do:    [________________]            │
│   Temat: [________________]            │
│   Label: [INBOX ▼]                     │  ← picker/chips
│   Od daty:  [2025-01-01]              │
│   Do daty:  [2025-04-02]              │
│   ☐ Nieprzeczytane  ☐ Gwiazdka        │
│   ☐ Newsletter      ☐ Auto-reply      │
│   🤖 AI Reranking  [toggle]           │  ← NEW
├────────────────────────────────────────┤
│ 3 wyniki • FTS5 + AI ✨               │
│ ┌──────────────────────────────────┐  │
│ │ EmailComponent (reużyty)         │  │
│ │ EmailComponent                    │  │
│ │ EmailComponent                    │  │
│ └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

**Kluczowe decyzje UI:**
- **Modal fullscreen** — React Native `Modal` z `animationType="slide"`
- Filtry zaawansowane domyślnie **zwinięte** — rozwijane po tapnięciu
- Debounced `TextInput` (300ms) dla szybkiego szukania
- **AI reranking toggle** — domyślnie OFF, użytkownik włącza świadomie
- Gdy AI reranking aktywny → mały loading spinner obok wyników
- **Reużywa** `EmailComponent` + `threadToEmailProps` dla wyników
- Tapnięcie na wynik → `router.push('/thread/[id]')` + zamknięcie modala
- **FlashList** na wyniki (spójność z listą inbox)

### 8. Zmiany w `list.tsx`

- `useState<boolean>` na widoczność modala
- Ikona 🔍 obok istniejącej ikony magic-wand w headerze
- `<SearchModal visible={...} onClose={...} accountId={...} />`

## ⚡ Kolejność implementacji

```
Krok 1: Migracja FTS5 + triggery                (baza danych)
Krok 2: db/repositories/search.ts               (warstwa dostępu FTS)
Krok 3: searchThreads() w threads.ts             (filtry metadanych)
Krok 4: features/search/hybridSearch.ts          (orkiestracja pipeline)
Krok 5: features/search/reranker.ts              (AI reranking)
Krok 6: queryKey + useSearchThreads()            (hook React Query)
Krok 7: SearchModal.tsx                          (UI)
Krok 8: Integracja w list.tsx                    (połączenie)
Krok 9: rebuildFTSIndex() w sync flow            (utrzymanie indeksu)
```

## 🎯 Zakres MVP vs. rozszerzenia

**MVP (to wdrażamy):**
- ✅ FTS5 virtual table z triggerami sync
- ✅ Szybkie wyszukiwanie (FTS5 MATCH → subject/snippet/nadawca z BM25)
- ✅ Filtry metadanych (nadawca, temat, label, data, flagi boolean)
- ✅ AI reranking via llama.rn / Z.AI (opcjonalny toggle)
- ✅ Hybrid pipeline: FTS5 preselekcja → filtry → AI rerank
- ✅ Modal fullscreen z wynikami jako FlashList

**Potencjalne rozszerzenia (poza MVP):**
- 🔮 FTS5 na `body_text` wiadomości (heavier index, ale pełniejsze wyniki)
- 🔮 Vector embeddings + cosine similarity (pełny RAG on-device)
- 🔮 Historia wyszukiwań (ostatnie query w SQLite)
- 🔮 Wyszukiwanie po załącznikach (has:attachment)
- 🔮 Gmail API search fallback (`q=` parameter) dla treści niesyncowanych
- 🔮 Saved searches / smart folders
