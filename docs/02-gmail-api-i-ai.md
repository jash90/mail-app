# Część 2: Integracja Gmail API i generowanie AI

**Commity:** `ad0f6b3` → `4185261`
**Zakres pracy:** Klient Gmail API (threads, messages, labels, sync, send, modify, helpers), integracja Z.AI

---

## 2.1 Klient Gmail API

**Commit `ad0f6b3`** — feat: add Gmail API integration (18 plików)

Największy pojedynczy commit — cały moduł `features/gmail/` z 12 plikami źródłowymi i 6 helperami.

### Warstwa HTTP (`api.ts`)

Trzypoziomowy klient z automatycznym zarządzaniem tokenami:

```typescript
// features/gmail/api.ts
let cachedToken: { value: string; expiresAt: number } | null = null;

export const getAccessToken = async (): Promise<string> => {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }
  const tokens = await getStoredTokens('gmail');
  if (!tokens) throw new Error('No Gmail tokens found.');
  if (isTokenExpired(tokens)) {
    const refreshed = await refreshGmailTokens(tokens.refresh_token);
    cachedToken = { value: refreshed.access_token, expiresAt: Date.now() + 55 * 60_000 };
    return refreshed.access_token;
  }
  cachedToken = { value: tokens.access_token, expiresAt: tokens.expiry_time - 60_000 };
  return tokens.access_token;
};

// Niskopoziomowy request z auth header
export const apiRequestRaw = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const token = await getAccessToken('gmail');
  return fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
};

// JSON wrapper
export const apiRequest = async <T>(url: string, options?: RequestInit): Promise<T> => { ... };

// Gmail-specific convenience
export const gmailRequest = async <T>(path: string): Promise<T> =>
  apiRequest<T>(`${GMAIL_API.baseUrl}${path}`);
```

### Mapowanie wątków (`threads.ts`)

Transformacja surowych danych Gmail na typy domenowe:

```typescript
export function mapGmailThreadToEmailThread(accountId: string, thread: GmailThread): EmailThread | null {
  const lastMessage = thread.messages?.[thread.messages.length - 1];
  if (!lastMessage) return null;

  const labelIds = lastMessage.labelIds || [];
  return {
    id: `${accountId}_${thread.id}`,
    provider_thread_id: thread.id,
    subject: cleanHeaderText(getHeader(lastMessage.payload.headers, 'Subject') || ''),
    participants: extractParticipants(thread.messages),
    is_read: !labelIds.includes('UNREAD'),
    is_starred: labelIds.includes('STARRED'),
    is_archived: !labelIds.includes('INBOX'),
    is_trashed: labelIds.includes('TRASH'),
    // ...
  };
}
```

### Synchronizacja (`sync.ts`)

Dwa tryby — full sync (pierwsze uruchomienie) i incremental (kolejne):

```typescript
// Incremental: pobiera tylko zmiany od ostatniego historyId
export async function performIncrementalSync(accountId: string, historyId: string) {
  const response = await gmailRequest<HistoryResponse>(
    `/history?startHistoryId=${historyId}&labelId=INBOX`
  );
  // Wyciąga ID zmienionych wątków → batch fetch tylko tych
  const changedThreadIds = extractChangedThreadIds(response.history);
  await batchGetThreads(accountId, changedThreadIds);
}
```

### Helpery

| Plik | Funkcje | Opis |
|------|---------|------|
| `helpers/address.ts` | `parseEmailAddress`, `parseEmailAddressList` | Parsowanie `"John <john@x.com>"` |
| `helpers/encoding.ts` | `base64Decode`, `fixTextEncoding` | Dekodowanie MIME encoded-words |
| `helpers/mime.ts` | `getHeader`, `extractBody`, `createRawEmail` | Operacje na strukturze MIME |
| `helpers/text.ts` | `cleanHeaderText`, `cleanSnippet` | Czyszczenie tekstu |

### React Query hooks (`hooks.ts`)

Publiczne API modułu — każda operacja Gmail ma dedykowany hook:

```typescript
export function useThreads(accountId: string, options?: PaginationOptions) {
  return useQuery({
    queryKey: gmailKeys.threads(accountId, options),
    queryFn: () => listThreads(accountId, options),
    staleTime: 24 * 60 * 60 * 1000, // 24h
  });
}

export function useSync(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => performSync(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gmailKeys.threads(accountId) });
    },
  });
}
```

---

## 2.2 Generowanie emaili AI

**Commit `4185261`** — feat: add AI email generation via Z.AI (1 plik)

Integracja z Z.AI (model GLM-5) do generowania odpowiedzi:

```typescript
// features/ai/api.ts
async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 30_000); // 30s timeout

  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: 'GLM-5-0414',
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    }),
    signal: controller.signal,
  });
  // ...
}

export async function generateReply(
  originalBody: string,
  userHint: string,
  subject?: string,
  sender?: { email: string; name: string },
  currentUser?: GoogleUser | null,
): Promise<string> {
  const systemPrompt = `You are writing an email reply.
    Match the language of the original email.
    Be professional but natural. Include proper greeting and sign-off.`;

  return chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Original email from ${sender?.name}: "${originalBody}"
     User instructions: "${userHint}"` },
  ]);
}
```

**Decyzje:**
- Z.AI (GLM-5) zamiast OpenAI — darmowy tier, wystarczająca jakość do emaili
- 30-sekundowy timeout z AbortController
- Dopasowanie języka do oryginału (automatyczne — prompt instruuje model)
- Temperature 0.7 — balans między kreatywnością a profesjonalizmem

---

## Screenshoty

> **Commit do builda:** Na tym etapie brak ekranów — tylko moduły backendowe. Przejdź do Części 3 (`c5145dc`).
