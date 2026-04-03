# Plan refaktoringu — Lint, Gałęzie, Ekstrakcja hooków

## Zadanie 1: Naprawić lint warnings (18 → 0)

### 1A. `app/_layout.tsx` — 16× `import/first`

**Problem:** Buffer polyfill (`global.Buffer = ...`) musi być przed innymi importami — celowe, nie da się zmienić kolejności.

**Rekomendowany wariant — wyekstrahować polyfill:**

1. Utworzyć `lib/polyfills.ts`:
   ```typescript
   import { Buffer } from 'buffer';
   global.Buffer = global.Buffer || Buffer;
   ```
2. W `_layout.tsx` zmienić na:
   ```typescript
   import '@/lib/polyfills';
   import '../global.css';
   import { initSentry, Sentry, navigationIntegration } from '@/lib/sentry';
   // ... reszta importów normalnie
   ```
3. Przenieść `initSentry()` do ciała komponentu lub top-level effect — albo zostawić i dodać jednorazowy `// eslint-disable-next-line import/first` tylko dla linii `initSentry()`.

**Wariant alternatywny — eslint-disable blok:**
```typescript
import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;

/* eslint-disable import/first */
import '../global.css';
// ... wszystkie importy
import 'react-native-reanimated';
/* eslint-enable import/first */
```

**Nakład:** ~15 min | **Ryzyko:** niskie

---

### 1B. `components/skeletons/SkeletonRow.tsx` — `react-hooks/exhaustive-deps`

**Problem:** `useSharedValue` zwraca stabilną referencję (`SharedValue`). ESLint nie wie, że to ref-like.

**Rozwiązanie — dodać `opacity` do deps:**
```typescript
useEffect(() => {
  opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
}, [opacity]);
```

Bezpieczne — `useSharedValue` zwraca stabilną referencję, effect nie odpalą się ponownie.

**Nakład:** ~5 min | **Ryzyko:** zerowe

---

### 1C. `components/skeletons/StatsSkeleton.tsx` — identyczny problem

**Rozwiązanie:** Identyczne jak 1B — dodać `opacity` do deps `useEffect`.

**Nakład:** ~2 min | **Ryzyko:** zerowe

---

### Podsumowanie Zadania 1

| Plik | Zmiana | Wariant |
|---|---|---|
| `lib/polyfills.ts` | **NOWY** — wyekstrahowany polyfill | Preferowany |
| `app/_layout.tsx` | Import `@/lib/polyfills` zamiast inline Buffer + przenieść `initSentry()` | Eliminuje 16 warnings |
| `components/skeletons/SkeletonRow.tsx` | Dodać `opacity` do deps `useEffect` | 1 warning |
| `components/skeletons/StatsSkeleton.tsx` | Dodać `opacity` do deps `useEffect` | 1 warning |

**Łączny nakład:** ~20 min | **Cel:** 18 → 0 warnings

---

## Zadanie 2: Wyczyścić gałęzie Git

### Analiza gałęzi

**Remote branches zmergowane do `master` (bezpieczne do usunięcia — 7 szt.):**

| Branch | Status |
|---|---|
| `origin/feat/posthog-analytics` | ✅ Zmergowany (0 commitów ahead) |
| `origin/feat/sentry-error-tracking` | ✅ Zmergowany |
| `origin/feature/email-search` | ✅ Zmergowany |
| `origin/feature/sync-manager` | ✅ Zmergowany |
| `origin/fix/gmail-modify-provider-id` | ✅ Zmergowany |
| `origin/fix/oauth-token-refresh` | ✅ Zmergowany |
| `origin/improve/search-enhancements` | ✅ Zmergowany |

**Lokalne + remote branches NIEZMERGOWANE (wymagają decyzji — 4 szt.):**

| Branch | Ahead of master | Status |
|---|---|---|
| `feat/local-llm-lifecycle-fixes` | 3 commity (ExecuTorch migration) | ⚠️ WIP |
| `feature/ai-executorch` | 1 commit (ExecuTorch provider) | ⚠️ WIP — powiązany z powyższym |
| `feature/delete-all-data` | 2 commity (delete button + TTS playlist) | ⚠️ WIP — feature incomplete |
| `feature/tts-playlist` | 1 commit (TTS playlist) | ⚠️ Zawarty w `feature/delete-all-data` |

### Plan wykonania

**Krok 1 — Usunąć 7 zmergowanych remote branches:**
```bash
git push origin --delete \
  feat/posthog-analytics \
  feat/sentry-error-tracking \
  feature/email-search \
  feature/sync-manager \
  fix/gmail-modify-provider-id \
  fix/oauth-token-refresh \
  improve/search-enhancements
```

**Krok 2 — Decyzja o 4 niezmergowanych branches:**
- Jeśli **kontynuujesz** prace → zachować, ewentualnie rebase na master
- Jeśli **porzucone** → usunąć lokalnie i remote:
  ```bash
  git branch -D feat/local-llm-lifecycle-fixes feature/ai-executorch feature/delete-all-data feature/tts-playlist
  git push origin --delete feat/local-llm-lifecycle-fixes feature/ai-executorch feature/delete-all-data feature/tts-playlist
  ```

**Krok 3 — Posprzątać lokalne referencje:**
```bash
git fetch --prune
```

**Nakład:** ~5 min | **Ryzyko:** zerowe (dla zmergowanych), wymaga decyzji (dla WIP)

**Rezultat:** 17 branches → 1 (`master`) + max 4 WIP

---

## Zadanie 3: Ekstrakcja hooków z dużych ekranów

### Analiza ekranów

| Ekran | Linie | Logika do wyekstrahowania | Priorytet |
|---|---|---|---|
| `thread/[id].tsx` | 256 | Reply logic, AI reply, mark-as-read | 🔴 Wysoki |
| `summary.tsx` | 247 | Summarization pipeline z retry | 🟡 Średni |
| `list.tsx` | 230 | Refresh + sync, delete, TTS | 🟡 Średni |
| `compose.tsx` | 224 | Contact autocomplete, AI generate, send | 🟡 Średni |
| `stats.tsx` | 208 | Fetch full stats, refresh | 🟢 Niski |

---

### 3A. `thread/[id].tsx` (256 → ~100 linii UI)

**Wyekstrahować `features/gmail/hooks/useThreadScreen.ts`:**

```typescript
export function useThreadScreen(compositeId: string) {
  // Stan: message, generatingAI, webViewHeights
  // Parsowanie compositeId
  // useThread + useThreadMessages queries
  // handleReply (z mutacją + analytics)
  // handleAIReply (z abort controller)
  // useMarkAsRead effect
  // analytics.threadOpened effect

  return {
    thread, messages, isLoading, isError,
    message, setMessage,
    generatingAI, replying,
    webViewHeights, handleHeightChange,
    handleReply, handleAIReply, handleBack,
  };
}
```

**Ekran staje się:** Czysty JSX z wywołaniem `useThreadScreen(id)`.

---

### 3B. `summary.tsx` (247 → ~80 linii UI)

**Wyekstrahować `features/ai/hooks/useSummaryPipeline.ts`:**

```typescript
export function useSummaryPipeline(accountId: string) {
  // items state, processed count
  // Waterfall summarization z cache check
  // retrySummary z abort controllers
  // Cleanup logic

  return { items, processed, total, retrySummary };
}
```

**Komponent `SummaryItemRow`** — już wyekstrahowany jako `memo`, zostawić w pliku.

---

### 3C. `list.tsx` (230 → ~90 linii UI)

**Wyekstrahować `features/gmail/hooks/useInboxScreen.ts`:**

```typescript
export function useInboxScreen() {
  // useThreads + pagination
  // useContactImportance
  // TTS queue
  // handleRefresh (sync + prefetch)
  // handleEndReached
  // handleDelete (z Alert)
  // handleThread navigation

  return {
    threads, isLoading, isError,
    importanceMap, tts,
    isRefreshing, isFetchingNextPage,
    searchVisible, setSearchVisible,
    handleRefresh, handleEndReached,
    handleDelete, handleThread, handleCompose,
    renderItem, refetch,
  };
}
```

---

### 3D. `compose.tsx` (224 → ~80 linii UI)

**Wyekstrahować 2 hooki:**

1. **`features/gmail/hooks/useContactAutocomplete.ts`:**
   ```typescript
   export function useContactAutocomplete() {
     // to, toName, debouncedTo, showSuggestions
     // useSearchContacts query
     return { to, setTo, toName, suggestions, showSuggestions, selectContact };
   }
   ```

2. **`features/ai/hooks/useAICompose.ts`:**
   ```typescript
   export function useAICompose() {
     // generating state, abort controller
     // generateWithAI logic
     return { generating, generateWithAI };
   }
   ```

---

### 3E. `stats.tsx` (208 linii) — niski priorytet

Ekran jest w normie (208 linii), logika biznesowa jest już w `useEmailStats`. Jedynie renderowanie stat cards jest rozwlekłe — można wyekstrahować `StatCardGrid` jeśli będzie rosnąć.

---

### Podsumowanie Zadania 3

| Nowy hook | Z ekranu | Redukcja ekranu |
|---|---|---|
| `features/gmail/hooks/useThreadScreen.ts` | `thread/[id].tsx` | 256 → ~100 |
| `features/ai/hooks/useSummaryPipeline.ts` | `summary.tsx` | 247 → ~80 |
| `features/gmail/hooks/useInboxScreen.ts` | `list.tsx` | 230 → ~90 |
| `features/gmail/hooks/useContactAutocomplete.ts` | `compose.tsx` | 224 → ~80 |
| `features/ai/hooks/useAICompose.ts` | `compose.tsx` | (wspólna redukcja) |

**Nakład:** ~2-3h | **Ryzyko:** niskie (refaktoring bez zmiany zachowania)

**Kolejność realizacji:** 3A → 3C → 3B → 3D → 3E (opcjonalne)

---

## Podsumowanie całego planu

| # | Zadanie | Nakład | Ryzyko | Efekt |
|---|---|---|---|---|
| **1** | Lint warnings → 0 | ~20 min | Niskie | Czyste `bun run lint` |
| **2** | Czyszczenie gałęzi | ~5 min | Zerowe | 17 → 1-5 branches |
| **3** | Ekstrakcja hooków | ~2-3h | Niskie | Ekrany: 230-256 → 80-100 linii |

**Łączny nakład: ~3-4h**
