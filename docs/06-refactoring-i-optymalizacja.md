# Część 6: Refactoring, simplifikacja i optymalizacja

**Commit:** `fdbed54`
**Zakres pracy:** Code review (reuse, quality, efficiency), ekstrakcja komponentów, optymalizacja zapytań SQL, eliminacja duplikacji

---

## 6.1 Proces code review

Przeprowadzono systematyczny code review plików powyżej 200 linii. Dla każdego pliku uruchomiono trzy równoległe analizy:

1. **Code Reuse Review** — szukanie duplikacji i istniejących utilit
2. **Code Quality Review** — hacky patterns, missing memoization, type safety
3. **Efficiency Review** — N+1 queries, re-render triggers, memory issues

### Pliki poddane review

| Plik | Linie przed | Linie po | Zmiana |
|------|------------|----------|--------|
| `app/thread/[id].tsx` | 265 | 216 | -49 |
| `features/stats/fetchAllMessages.ts` | 305 | 285 | -20 |
| `db/repositories/threads.ts` | 341 | 316 | -25 |
| `db/repositories/stats.ts` | 280 | 283 | +3 (lepsza wydajność) |
| `db/repositories/messages.ts` | 263 | 262 | -1 (bulk delete) |

---

## 6.2 Simplifikacja thread screen

### Problem: 265-liniowy monolityczny komponent

Oryginalny `thread/[id].tsx` zawierał:
- Inline `formatRelativeDate()` (64 linie)
- Inline `heightScript` i `wrapHtml()` (30 linii)
- Parsowanie composite ID
- Logikę reply z deduplikacją adresatów
- Generowanie AI reply
- Mark as read effect z brakującą zależnością
- WebView height tracking z curried callback
- Renderowanie listy wiadomości (43 linie JSX)
- Renderowanie paska odpowiedzi

### Rozwiązanie

**Ekstrakcja `ThreadMessageItem`** — memoizowany komponent (67 linii):

```typescript
// components/ThreadMessageItem.tsx
export const ThreadMessageItem = memo(function ThreadMessageItem({
  msg, isMe, height, onHeightChange,
}: ThreadMessageItemProps) {
  const htmlContent = msg.body.html ?? `<pre>${msg.body.text ?? ''}</pre>`;

  // Stabilny callback — nie tworzy nowej funkcji przy każdym renderze
  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const { height: h } = JSON.parse(event.nativeEvent.data);
      onHeightChange(msg.id, h);
    } catch {}
  }, [msg.id, onHeightChange]);

  return (
    <View className={`mb-5 ${isMe ? 'items-end' : 'items-start'} flex w-full p-4`}>
      <WebView
        source={{ html: wrapHtml(htmlContent) }}
        injectedJavaScript={heightScript}
        onMessage={handleMessage}
        style={{ height: height ?? 100, opacity: height ? 1 : 0.5 }}
      />
      <Text className={`mt-2 text-xs ${isMe ? 'text-indigo-200' : 'text-gray-400'}`}>
        {formatRelativeDateFine(msg.created_at)}
      </Text>
    </View>
  );
});
```

**Ekstrakcja `parseCompositeId`** — reużywalny utility:

```typescript
// lib/parseCompositeId.ts
export function parseCompositeId(id: string | undefined) {
  const separatorIndex = id?.indexOf('_') ?? -1;
  return {
    accountId: separatorIndex > 0 ? id!.slice(0, separatorIndex) : '',
    providerId: separatorIndex > 0 ? id!.slice(separatorIndex + 1) : '',
  };
}
```

**Fix useEffect** — brakująca zależność + error handling:

```typescript
// Przed (bug):
useEffect(() => {
  if (providerThreadId) mutateAsync(providerThreadId);
}, [providerThreadId]); // brak mutateAsync!

// Po (poprawione):
const { mutateAsync: markAsRead } = useMarkAsRead(accountId);
useEffect(() => {
  if (providerThreadId) markAsRead(providerThreadId).catch(() => {});
}, [providerThreadId, markAsRead]);
```

**Dodanie `useMemo`** na parsowanie ID:

```typescript
const { accountId, providerId: providerThreadId } = useMemo(
  () => parseCompositeId(id), [id]
);
```

---

## 6.3 Simplifikacja fetchAllMessages

### Problem: zduplikowana pętla batch processing

Main pass (linie 228-251) i retry rounds (linie 254-286) miały 55 linii niemal identycznego kodu.

### Rozwiązanie: wyodrębnienie `processBatchQueue`

```typescript
async function processBatchQueue(
  accountId: string,
  ids: string[],
  phase: StatsProgress['phase'],
  allThreads: EmailThread[],
  delayMs: number,
  onProgress?: (progress: StatsProgress) => void,
  onBatch?: (threads: EmailThread[], messages: StatMessage[][]) => void,
): Promise<{ retryIds: string[]; skippedCount: number }> {
  // Shared loop logic — used by both main pass and retry rounds
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batchIds = ids.slice(i, i + BATCH_SIZE);
    if (i > 0) await delay(delayMs);
    try {
      const result = await fetchBatch(accountId, batchIds, i, onBatch);
      allThreads.push(...result.threads);
      retryIds.push(...result.retryIds);
    } catch { retryIds.push(...batchIds); }
  }
}
```

### Reuse `parseEmailAddressList` zamiast duplikacji

```typescript
// Przed (zduplikowana logika):
const extractEmails = (header: string): string[] => {
  const raw = getHeader(headers, header) || '';
  return raw.split(',').map(a => {
    const m = a.match(/<([^>]+)>/);
    return (m ? m[1] : a).trim().toLowerCase();
  });
};

// Po (reuse istniejącego helpera):
const extractEmails = (header: string) =>
  parseEmailAddressList(getHeader(headers, header) || '').map(p => p.email.toLowerCase());
```

---

## 6.4 Optymalizacja DB repositories

### `threads.ts` — eliminacja duplikacji zapytań

Dwie funkcje z identycznym zapytaniem SQL (różniący się tylko WHERE):

```typescript
// Wspólny helper zamiast dwóch oddzielnych zapytań
function findMatchingProviderThreadIds(
  accountId: string, candidateIds: string[], extraCondition?: SQL
): Set<string> {
  const conditions = [
    eq(threads.accountId, accountId),
    inArray(threads.providerThreadId, candidateIds),
    ...(extraCondition ? [extraCondition] : []),
  ];
  return new Set(db.select({ providerThreadId: threads.providerThreadId })
    .from(threads).where(and(...conditions)).all().map(r => r.providerThreadId));
}

// countExistingThreads — teraz 3 linie zamiast 15
export function countExistingThreads(accountId: string, candidateIds: string[]): number {
  if (candidateIds.length === 0) return 0;
  return findMatchingProviderThreadIds(accountId, candidateIds).size;
}
```

### `stats.ts` — median w SQL zamiast JS

```typescript
// Przed: ładuje WSZYSTKIE wiersze do pamięci (O(n))
const threadCounts = db.select({ messageCount: threads.messageCount })
  .from(threads).orderBy(threads.messageCount).all().map(r => r.messageCount);
// ... sort + manual median

// Po: O(1) pamięci — AVG w SQL + LIMIT/OFFSET dla mediany
const threadAgg = db.select({
  avg: sql<number>`AVG(${threads.messageCount})`,
  count: sql<number>`COUNT(*)`,
}).from(threads).where(eq(threads.accountId, accountId)).get();

const midRows = db.select({ messageCount: threads.messageCount })
  .from(threads).orderBy(threads.messageCount)
  .limit(threadCount % 2 === 0 ? 2 : 1)
  .offset(Math.floor((threadCount - 1) / 2)).all();
```

### `messages.ts` — bulk delete zamiast pętli

```typescript
// Przed: 2N zapytań DELETE (per row)
db.transaction((tx) => {
  for (const row of staleRows) {
    tx.delete(messageRecipients).where(eq(messageRecipients.messageId, row.id)).run();
    tx.delete(messages).where(eq(messages.id, row.id)).run();
  }
});

// Po: 2 zapytania (bulk)
db.transaction((tx) => {
  tx.delete(messageRecipients).where(inArray(messageRecipients.messageId, staleIds)).run();
  tx.delete(messages).where(inArray(messages.id, staleIds)).run();
});
```

---

## 6.5 Co zostało pominięte (i dlaczego)

| Propozycja | Decyzja | Powód |
|-----------|---------|-------|
| N+1 hydration (batch participants/labels) | Pominięte | Wymaga zmiany architektury, ryzykowne bez testów |
| ScrollView → FlatList w thread | Pominięte | WebView nie wirtualizuje się dobrze |
| Shared participant upsert helper | Pominięte | 3 warianty z różnymi conflict strategies |
| Error boundary wokół WebView | Pominięte | Over-engineering dla tego scope |
| Cleanup AI request on unmount | Pominięte | Z.AI ma 30s timeout, wystarczające |
| Memoizacja handleReply/handleBack | Pominięte | Premature optimization dla button handlers |
| Magic numbers w scoring algorithm | Pominięte | Czytelne z istniejącymi komentarzami |

---

## Screenshoty

> **Commit do builda: `fdbed54`** — finalna wersja ze wszystkimi optymalizacjami.
>
> ```bash
> git checkout fdbed54    # lub po prostu HEAD
> npx expo start
> ```
>
> Wizualnie identyczny z `8544ac8` — zmiany są pod maską (performance, code quality).
> Użyj `8544ac8` lub `fdbed54` do screenshotów — oba wyglądają tak samo.
>
> **Lista screenshotów:**
> 1. Login screen
> 2. Inbox (lista emaili z tab bar)
> 3. Inbox (skeleton loading)
> 4. Thread (konwersacja email)
> 5. Thread (AI reply w trakcie)
> 6. Stats dashboard (pełne dane)
> 7. Stats (progress overlay)
> 8. Compose (z autocomplete kontaktów)
> 9. Settings

---

## Podsumowanie całego projektu

### Chronologia pracy (18 commitów)

| # | Commit | Opis | Pliki |
|---|--------|------|-------|
| 1 | `04c37d5` | Initial commit (Expo template) | - |
| 2 | `08ba133` | Konfiguracja projektu | 10 |
| 3 | `e339514` | Usunięcie kodu template | 17 |
| 4 | `86523bf` | Typy domenowe + config | 2 |
| 5 | `90dd82b` | Google OAuth | 2 |
| 6 | `ad0f6b3` | Gmail API (cały moduł) | 18 |
| 7 | `4185261` | AI email generation (Z.AI) | 1 |
| 8 | `c5145dc` | Ekrany i nawigacja | 8 |
| 9 | `41b5e1a` | README | 1 |
| 10 | `94654f3` | Optymalizacja layoutu | 3 |
| 11 | `8bd8dda` | Fix UI issues | 1 |
| 12 | `fd6685d` | Usunięcie CI workflow | 1 |
| 13 | `c1aa85e` | Update dependencies (SQLite) | 6 |
| 14 | `a4abb32` | SQLite + Drizzle ORM | 13 |
| 15 | `0bb8822` | Gmail → SQLite migration | 12 |
| 16 | `da4ac9f` | Moduł statystyk | 4 |
| 17 | `8544ac8` | Tab navigation + komponenty | 22 |
| 18 | `fdbed54` | Refactoring i simplifikacja | 3 |

### Statystyki finalne

- **61 plików źródłowych** (~4,668 linii TypeScript)
- **8 tabel SQLite** z indeksami i relacjami
- **18 React Query hooks** (dane + mutacje)
- **12 komponentów UI** (ekrany + reużywalne)
- **5 trybów sortowania** inbox
- **5 tierów ważności** kontaktów
- **3 fazy sync** (listing → loading → retrying)
