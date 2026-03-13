# Część 1: Inicjalizacja projektu i fundamenty

**Commity:** `04c37d5` → `08ba133` → `e339514` → `86523bf` → `90dd82b`
**Zakres pracy:** Scaffold projektu Expo, konfiguracja, typy domenowe, autentykacja Google OAuth

---

## 1.1 Scaffold projektu

**Commit `04c37d5`** — Initial commit (Expo template)
**Commit `08ba133`** — Konfiguracja projektu (10 plików)
**Commit `e339514`** — Usunięcie domyślnego kodu Expo template (17 plików)

Projekt powstał z `npx create-expo-app` z szablonem TypeScript. Po wygenerowaniu:
- Skonfigurowano `app.json` z bundle ID (`com.jash.mail-app`), orientacją portrait, plugins
- Włączono New Architecture (React Native Fabric)
- Włączono React Compiler i typedRoutes (Expo Router)
- Usunięto domyślne ekrany i komponenty szablonu

## 1.2 Typy domenowe i konfiguracja

**Commit `86523bf`** — feat: add core types and config constants (2 pliki)

Stworzono centralny system typów w `types/index.ts` — fundament całej aplikacji:

```typescript
// types/index.ts
export interface EmailParticipant {
  name: string | null;
  email: string;
}

export interface EmailThread {
  id: string;
  account_id: string;
  provider_thread_id: string;
  subject: string;
  snippet: string;
  participants: EmailParticipant[];
  last_message_at: string;
  message_count: number;
  is_read: boolean;
  is_starred: boolean;
  is_archived: boolean;
  is_trashed: boolean;
  label_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface EmailMessage {
  id: string;
  thread_id: string;
  from: EmailParticipant;
  to: EmailParticipant[];
  cc: EmailParticipant[];
  bcc: EmailParticipant[];
  body: { text: string | null; html: string | null };
  attachments: EmailAttachment[];
  headers: { message_id: string; in_reply_to?: string; references?: string[] };
  // ...
}
```

Stałe API w `config/constants.ts`:
```typescript
export const GMAIL_API = {
  baseUrl: 'https://gmail.googleapis.com/gmail/v1/users/me',
  batchUrl: 'https://gmail.googleapis.com/batch/gmail/v1',
  quotaUnits: {
    messagesList: 5,
    messagesGet: 5,
    messagesSend: 100,
    threadsGet: 10,
    historyList: 2,
  },
};
```

## 1.3 Autentykacja Google OAuth

**Commit `90dd82b`** — feat: add authentication with Google OAuth (2 pliki)

Implementacja zarządzania tokenami OAuth w `features/auth/oauthService.ts`:

```typescript
// features/auth/oauthService.ts
const TOKEN_KEY_PREFIX = 'oauth_tokens_';
const TOKEN_EXPIRY_BUFFER_MS = 60_000; // refresh 1 min early

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expiry_time: number;
  user: GoogleUser | null;
}

export async function getStoredTokens(accountType: string): Promise<StoredTokens | null> {
  const raw = await SecureStore.getItemAsync(`${TOKEN_KEY_PREFIX}${accountType}`);
  if (!raw) return null;
  return JSON.parse(raw) as StoredTokens;
}

export function isTokenExpired(tokens: StoredTokens): boolean {
  return Date.now() >= tokens.expiry_time - TOKEN_EXPIRY_BUFFER_MS;
}

export async function refreshGmailTokens(refreshToken: string) {
  // Expo Google Sign-In manages refresh internally
  const { accessToken } = await GoogleSignin.getTokens();
  return { access_token: accessToken, expiry_time: Date.now() + 3600_000 };
}
```

Stan autentykacji w Zustand (`store/authStore.ts`):
```typescript
export const useAuthStore = create<AuthState & AuthActions>()((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: true }),
  clearUser: () => set({ user: null, isAuthenticated: false }),
}));
```

**Decyzje:**
- `expo-secure-store` do przechowywania tokenów (encrypted storage)
- 60-sekundowy bufor przed wygaśnięciem → preemptive refresh
- Zustand zamiast Context API — synchroniczny dostęp z dowolnego miejsca

---

## Screenshoty

> **Commit do builda:** Na tym etapie aplikacja nie ma jeszcze ekranów — tylko fundament (typy, auth, config). Nie ma czego screenshotować. Przejdź do Części 3 (`c5145dc`) dla pierwszego działającego UI.
