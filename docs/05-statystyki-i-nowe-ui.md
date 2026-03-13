# Część 5: Moduł statystyk, nawigacja tabami i nowe komponenty

**Commity:** `da4ac9f` → `8544ac8`
**Zakres pracy:** Feature statystyk emailowych, batch fetching z retry, restructuring UI na tab navigation, komponenty wizualizacji

---

## 5.1 Moduł statystyk

**Commit `da4ac9f`** — feat: add email stats feature with batch message fetching (4 pliki)

### Batch pobieranie wiadomości (`features/stats/fetchAllMessages.ts`)

Pobiera WSZYSTKIE wiadomości z INBOX i SENT do obliczenia statystyk:

```typescript
// Orkiestracja: list → filter cache → batch fetch → retry
export async function fetchAllMessages(accountId, onProgress?, onBatch?) {
  // 1. Pobierz wszystkie thread IDs z INBOX + SENT
  const allThreadIds = await listAllThreadIds(['INBOX', 'SENT'], onProgress);

  // 2. Usuń z DB wątki których już nie ma w INBOX
  const purgedCount = purgeThreadsNotInList(accountId, allThreadIds);

  // 3. Filtruj — pomiń wątki zaktualizowane w ciągu 24h
  const staleIds = filterStaleProviderThreadIds(accountId, allThreadIds);

  // 4. Pobieraj w batchach po 100
  let { retryIds, skippedCount } = await processBatchQueue(
    accountId, staleIds, 'loading', allThreads, 200, onProgress, onBatch
  );

  // 5. Retry rounds z exponential backoff (4s, 8s, 16s)
  for (let round = 0; round < 3 && retryQueue.length > 0; round++) {
    await delay(4000 * 2 ** round);
    const result = await processBatchQueue(...);
    retryQueue = result.retryIds;
  }
}
```

### Batch request pattern

Każdy batch to multipart HTTP request z wieloma GET-ami:

```typescript
async function fetchBatch(accountId, batchIds, batchIndex, onBatch) {
  const boundary = `batch_stats_${Date.now()}_${batchIndex}`;
  const body = batchIds.map(id =>
    `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <${id}>\r\n\r\n` +
    `GET /gmail/v1/users/me/threads/${id}?format=metadata&metadataHeaders=From&...`
  ).join('') + `--${boundary}--`;

  const response = await fetchBatchWithRetry(GMAIL_API.batchUrl, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/mixed; boundary=${boundary}` },
    body,
  });

  // Parsuj multipart response, mapuj na EmailThread, upsert do SQLite
  const parts = parseMultipartResponseWithStatus(responseText, responseBoundary);
  // 429/500+ → retry, 404/410 → skip, 200 → map + persist
}
```

### Lekki upsert dla statystyk

`extractStatMessage` wyciąga tylko potrzebne pola (bez body/attachments):

```typescript
function extractStatMessage(msg: GmailMessage): StatMessage {
  const from = parseEmailAddress(getHeader(headers, 'From') || '').email.toLowerCase();
  const extractEmails = (header: string) =>
    parseEmailAddressList(getHeader(headers, header) || '').map(p => p.email.toLowerCase());

  return { id: msg.id, from, to: extractEmails('To'), cc: extractEmails('Cc'),
           bcc: extractEmails('Bcc'), date: parseInt(msg.internalDate, 10) };
}
```

### React hooks dla statystyk (`features/stats/hooks.ts`)

```typescript
export function useStatsProgress() {
  const [progress, setProgress] = useState<StatsProgress | null>(null);
  // ... tracks loading/listing/retrying phases with counts
}

export function useComputeStats(accountId: string) {
  return useQuery({
    queryKey: ['stats', accountId],
    queryFn: () => computeStatsFromDb(accountId, userEmail),
    staleTime: 30 * 60 * 1000, // 30min
  });
}
```

---

## 5.2 Restructuring UI — tab navigation i nowe komponenty

**Commit `8544ac8`** — feat: restructure app with tab navigation and new components (22 pliki, +794/-234 linii)

> **BUILD & SCREENSHOTS:** Commit `8544ac8` to najbardziej wizualnie kompletna wersja z tab navigation, statystykami, skeletonami.
>
> ```bash
> git checkout 8544ac8
> npx expo start
> # Screenshoty: Login → Inbox (z tab bar) → Stats dashboard → Settings → Thread → Compose
> ```

### Nowa nawigacja (`app/(tabs)/_layout.tsx`)

Zamiana flat stack na bottom tabs:

```typescript
export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: '#000', borderTopColor: '#27272a' },
      tabBarActiveTintColor: '#818cf8',
    }}>
      <Tabs.Screen name="list" options={{ title: 'Inbox', tabBarIcon: ({ color }) =>
        <Icon name="envelope" size={20} color={color} /> }} />
      <Tabs.Screen name="stats" options={{ title: 'Stats', tabBarIcon: ({ color }) =>
        <Icon name="chart" size={20} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) =>
        <Icon name="settings" size={20} color={color} /> }} />
    </Tabs>
  );
}
```

### Dashboard statystyk (`app/(tabs)/stats.tsx`)

```typescript
export default function StatsScreen() {
  const { data: stats } = useComputeStats(accountId);
  const { progress, fetchAll } = useStatsProgress();

  return (
    <ScrollView>
      {/* Karty z liczbami */}
      <StatCard label="Sent" value={stats.totalSent} />
      <StatCard label="Received" value={stats.totalReceived} />

      {/* Top kontakty */}
      <ContactRankingList title="Top Senders" contacts={stats.topSenders} />
      <ContactRankingList title="Top Recipients" contacts={stats.topRecipients} />

      {/* Wykresy */}
      <TimeChart title="Hourly Distribution" data={stats.timeDistribution.hourOfDay} />
      <TimeChart title="Daily Distribution" data={stats.timeDistribution.dayOfWeek} />
      <ThreadLengthChart buckets={stats.threadLengths.buckets} />

      {/* Progress overlay podczas ładowania */}
      {progress && <ProgressOverlay progress={progress} />}
    </ScrollView>
  );
}
```

### Nowe komponenty

| Komponent | Linie | Opis |
|-----------|-------|------|
| `StatCard` | 18 | Karta z wartością liczbową i etykietą |
| `ContactRankingList` | 45 | Lista top kontaktów z liczbą emaili |
| `TimeChart` | 62 | Wykres słupkowy (Victory + Skia) |
| `ThreadLengthChart` | 42 | Histogram długości wątków |
| `ProgressOverlay` | 48 | Overlay z paskiem postępu i fazą |
| `ResponseTimeList` | 38 | Czasy odpowiedzi |
| `ListSkeleton` | 12 | Skeleton listy emaili |
| `SkeletonRow` | 30 | Animowany skeleton row (pulse) |
| `StatsSkeleton` | 28 | Skeleton dashboardu statystyk |

### Wyodrębnione utility (`lib/`)

Kod wcześniej inline w `thread/[id].tsx` przeniesiony do shared modules:

```typescript
// lib/emailHtml.ts — dark theme wrapper dla email HTML w WebView
export function wrapHtml(html: string) {
  return `<!DOCTYPE html><html><head>
    <style>* { color: #fff !important; background: #000 !important; }
    a { color: #818cf8 !important; }</style>
    </head><body>${html}</body></html>`;
}

// lib/formatDate.ts — relatywne daty
export function formatRelativeDateFine(dateString: string): string {
  const diffMins = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  // ...
}
```

---

## Screenshoty

> **Commit do builda: `8544ac8`** — pełna aplikacja z tab bar, statystykami, skeleton loading.
>
> Screenshoty do zrobienia:
> 1. **Login** — ekran Google Sign-In
> 2. **Inbox** — lista emaili z tab bar na dole
> 3. **Inbox (loading)** — skeleton loading
> 4. **Stats** — dashboard ze statystykami
> 5. **Stats (loading)** — progress overlay z fazą
> 6. **Settings** — ekran ustawień
> 7. **Thread** — konwersacja z WebView
> 8. **Compose** — tworzenie emaila z autocomplete
