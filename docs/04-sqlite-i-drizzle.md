# Część 4: Warstwa danych SQLite i migracja Gmail na lokalne cache

**Commity:** `c1aa85e` → `a4abb32` → `0bb8822`
**Zakres pracy:** Dodanie Drizzle ORM + SQLite, schema z 8 tabelami, migration Gmail feature z API-first na cache-first

---

## 4.1 Konfiguracja zależności

**Commit `c1aa85e`** — chore: update dependencies and build configuration (6 plików)

Nowe zależności:
- `drizzle-orm` + `drizzle-kit` — typowany ORM dla SQLite
- `expo-sqlite` — natywny driver SQLite dla Expo
- Aktualizacja `metro.config.js` i `babel.config.js` dla wsparcia SQLite

```javascript
// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
```

## 4.2 Schema bazy danych

**Commit `a4abb32`** — feat: add SQLite database layer with Drizzle ORM (13 plików)

### Schema (`db/schema.ts`) — 8 tabel

```typescript
// Główna tabela wątków
export const threads = sqliteTable('threads', {
  id: text('id').primaryKey(),                    // {accountId}_{providerThreadId}
  accountId: text('account_id').notNull(),
  providerThreadId: text('provider_thread_id').notNull(),
  subject: text('subject').notNull().default(''),
  snippet: text('snippet').notNull().default(''),
  lastMessageAt: text('last_message_at').notNull(),
  messageCount: integer('message_count').notNull().default(0),
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(true),
  isStarred: integer('is_starred', { mode: 'boolean' }).notNull().default(false),
  isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
  isTrashed: integer('is_trashed', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_threads_account').on(table.accountId),
  index('idx_threads_last_message').on(table.accountId, table.lastMessageAt),
  index('idx_threads_unread').on(table.accountId, table.isRead, table.lastMessageAt),
]);

// Uczestnicy — deduplikacja po email
export const participants = sqliteTable('participants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull(),
  name: text('name'),
}, (table) => [uniqueIndex('idx_participants_email').on(table.email)]);

// Wiadomości z pełnym body i headerami
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').references(() => threads.id, { onDelete: 'cascade' }),
  fromEmail: text('from_email').notNull(),
  bodyText: text('body_text'),
  bodyHtml: text('body_html'),
  headerMessageId: text('header_message_id'),
  headerInReplyTo: text('header_in_reply_to'),
  headerReferences: text('header_references'), // JSON stringified
  // ...
});
```

### Repositories — warstwa dostępu do danych

```typescript
// db/repositories/threads.ts — batch upsert w transakcji
export function upsertThreads(threadList: EmailThread[]): void {
  db.transaction((tx) => {
    for (const t of threadList) {
      tx.insert(threads).values({ ... }).onConflictDoUpdate({ target: threads.id, set: { ... } }).run();

      // Replace labels
      tx.delete(threadLabels).where(eq(threadLabels.threadId, t.id)).run();
      for (const labelId of t.label_ids) {
        tx.insert(threadLabels).values({ threadId: t.id, labelId }).onConflictDoNothing().run();
      }

      // Upsert participants with COALESCE on name
      for (const p of t.participants) {
        tx.insert(participants).values({ email: p.email.toLowerCase(), name: p.name })
          .onConflictDoUpdate({ target: participants.email,
            set: { name: sql`COALESCE(excluded.name, participants.name)` } })
          .run();
      }
    }
  });
}

// Paginowane zapytanie z SQL-based sorting
export function getThreadsPaginated(accountId: string, options: PaginationOptions): EmailThread[] {
  const orderBy = (() => {
    switch (sortMode) {
      case 'recent': return desc(threads.lastMessageAt);
      case 'unread_first': return asc(threads.isRead);
      case 'starred_first': return desc(threads.isStarred);
      // ...
    }
  })();
  // ... query with optional label JOIN + hydration
}
```

### Statystyki z SQL (`db/repositories/stats.ts`)

```typescript
// Top senders — SQL GROUP BY + COUNT zamiast JS accumulator
const topSenders = db.select({
  email: messages.fromEmail,
  name: participants.name,
  receivedCount: sql<number>`COUNT(*)`.as('received_count'),
}).from(messages)
  .leftJoin(participants, eq(participants.email, messages.fromEmail))
  .where(and(eq(messages.accountId, accountId), ne(messages.fromEmail, lowerUser)))
  .groupBy(messages.fromEmail)
  .orderBy(sql`received_count DESC`)
  .limit(10).all();

// Dystrybucja godzinowa — strftime w SQLite
const hourOfDay = getTimeDistribution(accountId, '%H', 24);
// → SELECT CAST(strftime('%H', created_at) AS INTEGER) as bucket, COUNT(*) ...
```

## 4.3 Migracja Gmail na SQLite cache

**Commit `0bb8822`** — refactor: update Gmail feature with batch helpers and SQLite support (12 plików)

Kluczowa zmiana — Gmail feature przeszedł z API-first na cache-first:

### Przed (API-first):
```
useThreads() → listThreads() → Gmail API → zwróć do UI
```

### Po (cache-first):
```
useThreads() → getThreadsPaginated(SQLite) → zwróć do UI
useSync() → Gmail API → upsert SQLite → invalidate React Query
```

### Batch multipart parser (`helpers/batch.ts`)

```typescript
// Parsowanie odpowiedzi Gmail Batch API (multipart/mixed)
export function parseMultipartResponseWithStatus(
  responseText: string, boundary: string
): BatchPartResult[] {
  const parts = responseText.split(`--${boundary}`);
  return parts.filter(p => p.trim() && !p.startsWith('--')).map(part => {
    const [headers, body] = part.split('\r\n\r\n', 2);
    const statusMatch = body?.match(/^HTTP\/\d\.\d (\d+)/);
    const jsonStart = body?.indexOf('{');
    return {
      contentId: headers.match(/Content-ID: <(.+)>/)?.[1],
      status: parseInt(statusMatch?.[1] ?? '0'),
      body: jsonStart >= 0 ? JSON.parse(body.slice(jsonStart)) : null,
    };
  });
}
```

### Usunięcie persister

Plik `features/gmail/persister.ts` (AsyncStorage-based React Query persister) został **usunięty** — SQLite przejął rolę persistence layer.

---

## Screenshoty

> **Commit do builda: `0bb8822`** — aplikacja działa z SQLite cache. Wizualnie wygląda tak samo jak `94654f3`, ale dane ładują się szybciej z lokalnego cache.
>
> Na tym etapie nawigacja to wciąż flat stack (bez tabów). Screenshoty będą identyczne z Częścią 3.
