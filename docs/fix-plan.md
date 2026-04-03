# Plan naprawy — mail-app

**Data:** 2026-04-03  
**Bazuje na:** `docs/project-analysis.md`

---

## Faza 0: Domknięcie bieżącego refaktoringu ⏱️ ~30 min

Uncommitted changes z ekstrakcji hooków są gotowe, ale wymagają drobnych porządków przed commitem.

### 0A. Ujednolicić importy w `compose.tsx`

**Problem:** `compose.tsx` importuje `useSendEmail` z `@/features/gmail/hooks` (stary plik), a `useContactAutocomplete` z `@/features/gmail/hooks/useContactAutocomplete` (nowy plik). Mieszanie ścieżek.

**Fix:** Przenieść eksport `useSendEmail` do barrel `@/features/gmail` (już tam jest) i zaimportować z `@/features/gmail`.

```diff
- import { useSendEmail } from '@/features/gmail/hooks';
- import { useContactAutocomplete } from '@/features/gmail/hooks/useContactAutocomplete';
+ import { useSendEmail } from '@/features/gmail';
+ import { useContactAutocomplete } from '@/features/gmail/hooks/useContactAutocomplete';
```

### 0B. Rozwiązać zależność kołową w `useContactAutocomplete`

**Problem:** `features/gmail/hooks/useContactAutocomplete.ts` importuje `useSearchContacts` z `@/features/gmail/hooks` (stary plik). Nowe hooki powinny importować przez barrel `@/features/gmail` lub bezpośrednio.

**Fix:** Zmienić import:
```diff
- import { useSearchContacts } from '@/features/gmail/hooks';
+ import { useSearchContacts } from '@/features/gmail/hooks';  // zostawić — ale dodać useSearchContacts do barrel index
```

Najlepsze rozwiązanie: dodać `useSearchContacts` do eksportów w `features/gmail/index.ts` i importować z `@/features/gmail`.

### 0C. Scommitować refaktoring

```bash
git add -A
git commit -m "refactor: extract screen hooks (useInboxScreen, useThreadScreen, useSummaryPipeline, useAICompose, useContactAutocomplete), extract polyfills, fix skeleton deps"
```

---

## Faza 1: Konsolidacja hooków Gmail 🔴 Priorytet wysoki ⏱️ ~1h

### Problem

Po ekstrakcji hooków ekranowych powstała **podwójna struktura**:

```
features/gmail/hooks.ts          ← 223 linii, 18 eksportów (React Query wrappery)
features/gmail/hooks/            ← 3 pliki (hooki ekranowe)
  ├── useInboxScreen.ts
  ├── useThreadScreen.ts
  └── useContactAutocomplete.ts
```

Stary `hooks.ts` nadal eksportuje core hooki (`useThreads`, `useThread`, `useSendReply` itd.) i jest re-eksportowany przez `features/gmail/index.ts`.

### Plan

#### 1A. Rozbić `features/gmail/hooks.ts` (223 linii) na moduły tematyczne

| Nowy plik | Hooki | Linii |
|---|---|---|
| `features/gmail/hooks/useThreadQueries.ts` | `useThreads`, `useThread`, `useThreadMessages` | ~40 |
| `features/gmail/hooks/useThreadMutations.ts` | `useMarkAsRead`, `useMarkAsUnread`, `useToggleStar`, `useArchiveThread`, `useTrashThread`, `useDeleteThread` | ~40 |
| `features/gmail/hooks/useSendHooks.ts` | `useSendEmail`, `useSendReply` | ~35 |
| `features/gmail/hooks/useSyncHooks.ts` | `useSync`, `useSyncNextPage`, `isSyncReady` | ~45 |
| `features/gmail/hooks/useSearchHooks.ts` | `useSearchThreads`, `useSearchContacts`, `useContactImportance` | ~35 |
| `features/gmail/hooks/useLabelsHook.ts` | `useLabels` | ~10 |

#### 1B. Dodać barrel `features/gmail/hooks/index.ts`

```typescript
export { useThreads, useThread, useThreadMessages } from './useThreadQueries';
export { useMarkAsRead, useMarkAsUnread, useToggleStar, useArchiveThread, useTrashThread, useDeleteThread } from './useThreadMutations';
export { useSendEmail, useSendReply } from './useSendHooks';
export { useSync, useSyncNextPage, isSyncReady } from './useSyncHooks';
export { useSearchThreads, useSearchContacts, useContactImportance } from './useSearchHooks';
export { useLabels } from './useLabelsHook';
export { useInboxScreen } from './useInboxScreen';
export { useThreadScreen } from './useThreadScreen';
export { useContactAutocomplete } from './useContactAutocomplete';
```

#### 1C. Zaktualizować `features/gmail/index.ts`

```diff
- export { useThreads, useContactImportance, ... } from './hooks';
+ export { useThreads, useContactImportance, ... } from './hooks/index';
```

#### 1D. Usunąć stary `features/gmail/hooks.ts`

Po przeniesieniu całej zawartości — usunąć plik.

#### 1E. Zaktualizować importy w konsumentach

Pliki do aktualizacji:
- `app/compose.tsx` — `useSendEmail`
- `features/gmail/hooks/useContactAutocomplete.ts` — `useSearchContacts`
- `features/gmail/hooks/useInboxScreen.ts` — `useThreads`, `useContactImportance`, `useTrashThread`
- `features/gmail/hooks/useThreadScreen.ts` — `useMarkAsRead`, `useSendReply`, `useThread`, `useThreadMessages`
- `components/search/SearchModal.tsx` — `useLabels`, `useSearchThreads`, `isSyncReady`

**Zasada:** Konsumenci spoza `features/gmail/` importują z `@/features/gmail`. Konsumenci wewnątrz `features/gmail/hooks/` importują relatywnie.

---

## Faza 2: Porządek Git 🟢 Priorytet niski ⏱️ ~10 min

### 2A. Usunąć zmergowane remote branches

Zmergowane branche zostały już usunięte w poprzednich operacjach (weryfikacja: `git branch -a` nie pokazuje 7 starych). ✅ Gotowe.

### 2B. Zdecydować o 4 WIP branches

| Branch | Rekomendacja |
|---|---|
| `feat/local-llm-lifecycle-fixes` | 🗑️ Usunąć — ExecuTorch porzucony na rzecz llama.rn |
| `feature/ai-executorch` | 🗑️ Usunąć — powiązany z powyższym |
| `feature/delete-all-data` | 📌 Zachować jeśli planujesz — rebase na master |
| `feature/tts-playlist` | 🗑️ Usunąć — zawarty w `feature/delete-all-data` |

```bash
# Usunąć porzucone (po decyzji)
git branch -D feat/local-llm-lifecycle-fixes feature/ai-executorch feature/tts-playlist
git push origin --delete feat/local-llm-lifecycle-fixes feature/ai-executorch feature/tts-playlist

# Rebase zachowanego
git checkout feature/delete-all-data && git rebase master && git checkout master

# Porządek
git fetch --prune
```

---

## Faza 3: Testy 🔴 Priorytet wysoki ⏱️ ~4-6h

Największy dług techniczny projektu. Zero testów — jedyne zabezpieczenie to lint + typecheck.

### 3A. Setup infrastruktury testowej ⏱️ ~30 min

```bash
bun add -d jest @testing-library/react-native @testing-library/jest-native jest-expo @types/jest
```

Pliki konfiguracyjne:
- `jest.config.ts` — preset `jest-expo`, transformy, moduleNameMapper (`@/` alias)
- `tests/setup.ts` — mocki dla `expo-secure-store`, `expo-sqlite`, `react-native-reanimated`
- Skrypt w `package.json`: `"test": "jest"`, `"test:watch": "jest --watch"`

### 3B. Testy krytycznych ścieżek — Warstwa 1 (czysta logika) ⏱️ ~2h

| Moduł | Plik testowy | Co testować |
|---|---|---|
| `lib/rateLimiter.ts` | `tests/lib/rateLimiter.test.ts` | Throttling, backoff exponential, Retry-After, jitter, max retries |
| `features/gmail/helpers/batch.ts` | `tests/features/gmail/helpers/batch.test.ts` | Multipart boundary parsing, status codes, edge cases (puste ciało, malformed) |
| `features/gmail/helpers/encoding.ts` | `tests/features/gmail/helpers/encoding.test.ts` | Base64url decode, charset handling, UTF-8 |
| `features/gmail/helpers/text.ts` | `tests/features/gmail/helpers/text.test.ts` | HTML stripping, text normalization, encoding fix |
| `features/gmail/helpers/address.ts` | `tests/features/gmail/helpers/address.test.ts` | Email address parsing (name + email, edge cases) |
| `features/gmail/helpers/mime.ts` | `tests/features/gmail/helpers/mime.test.ts` | MIME type detection, content extraction |
| `lib/parseCompositeId.ts` | `tests/lib/parseCompositeId.test.ts` | Composite ID split, invalid input handling |
| `lib/formatDate.ts` | `tests/lib/formatDate.test.ts` | Formatowanie dat, locale, relative time |
| `lib/chunk.ts` | `tests/lib/chunk.test.ts` | Array chunking, edge cases (pusta tablica, chunk > length) |
| `features/tts/detectLang.ts` | `tests/features/tts/detectLang.test.ts` | Detekcja polskiego vs angielskiego, krótkie teksty |
| `features/search/reranker.ts` | `tests/features/search/reranker.test.ts` | Score ranking, normalizacja, sortowanie |

### 3C. Testy warstwy danych — Warstwa 2 (repositories) ⏱️ ~2h

Wymagają in-memory SQLite (expo-sqlite mock lub `better-sqlite3` w testach).

| Moduł | Plik testowy | Co testować |
|---|---|---|
| `db/repositories/threads/` | `tests/db/repositories/threads.test.ts` | Upsert, queries z paginacją, hydration, search FTS |
| `db/repositories/messages.ts` | `tests/db/repositories/messages.test.ts` | Insert/update, relacje z threads, recipients |
| `db/repositories/syncState.ts` | `tests/db/repositories/syncState.test.ts` | Upsert sync token, get state |
| `db/repositories/stats/` | `tests/db/repositories/stats.test.ts` | Contact importance, compute stats |
| `db/repositories/labels.ts` | `tests/db/repositories/labels.test.ts` | Label CRUD, thread-label relacje |
| `db/repositories/search.ts` | `tests/db/repositories/search.test.ts` | FTS rebuild, search queries, ranking |

### 3D. Testy hooków — Warstwa 3 (opcjonalnie, po Warstwie 1 i 2) ⏱️ ~2h

Z `@testing-library/react-native` + `renderHook`:

| Hook | Co testować |
|---|---|
| `useAICompose` | Abort controller cleanup, generating state toggle |
| `useSummaryPipeline` | Cache check, retry logic, waterfall ordering |
| `useContactAutocomplete` | Debounce, suggestion filtering |

### Priorytet testów

```
Warstwa 1 (czysta logika)  →  NAJPIERW — łatwe, zero mocków, wysoka wartość
Warstwa 2 (repositories)   →  POTEM — wymaga setup SQLite, ale krytyczne
Warstwa 3 (hooki)          →  OPCJONALNIE — wymaga renderHook, mniejszy ROI
```

---

## Faza 4: Drobne porządki 🟢 Priorytet niski ⏱️ ~30 min

### 4A. Dodać barrel `features/ai/hooks/index.ts`

```typescript
export { useAICompose } from './useAICompose';
export { useSummaryPipeline } from './useSummaryPipeline';
```

### 4B. Zaktualizować `features/ai/` — barrel eksporty

Dodać re-eksport hooków AI z głównego indeksu (jeśli istnieje `features/ai/index.ts`).

### 4C. Usunąć `docs/refactoring-plan.md`

Po domknięciu Fazy 0 i 1 — plan refaktoringu jest zrealizowany i nieaktualny. Można zarchiwizować lub usunąć.

---

## Podsumowanie

| Faza | Zadanie | Nakład | Priorytet | Ryzyko |
|---|---|---|---|---|
| **0** | Domknąć refaktoring + commit | ~30 min | 🔴 Natychmiast | Niskie |
| **1** | Konsolidacja hooków Gmail | ~1h | 🔴 Wysoki | Niskie |
| **2** | Porządek Git (branches) | ~10 min | 🟢 Niski | Zerowe |
| **3** | Testy (setup + Warstwa 1 + 2) | ~4-6h | 🔴 Wysoki | Niskie |
| **4** | Drobne porządki (barrels, docs) | ~30 min | 🟢 Niski | Zerowe |

**Łączny nakład: ~6-8h**

### Kolejność realizacji

```
Faza 0 (commit)  →  Faza 1 (hooki)  →  Faza 3A (test setup)  →  Faza 3B (testy logiki)
                                                                        ↓
                                     Faza 2 (git cleanup)    ←   Faza 3C (testy DB)
                                                                        ↓
                                     Faza 4 (porządki)       ←   Faza 3D (testy hooków, opcjonalnie)
```
