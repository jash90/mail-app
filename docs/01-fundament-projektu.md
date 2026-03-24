# Część 1: Fundament projektu

**Commity:** `04c37d5` → `90dd82b` → `ad0f6b3` → `4185261`
**Zakres:** Scaffold Expo, typy domenowe, config, Google OAuth, Gmail API, Z.AI

---

## 1.1 Scaffold i konfiguracja

**`04c37d5`** Initial commit (Expo template)
**`08ba133`** Konfiguracja projektu (10 plików)
**`e339514`** Usunięcie domyślnego kodu template (17 plików)

Projekt utworzony z `npx create-expo-app` z szablonem TypeScript:
- Bundle ID: `com.jash.mail-app` (iOS), `com.jash.mailapp` (Android)
- New Architecture (Fabric), React Compiler, typedRoutes
- Orientacja portrait-only

## 1.2 Typy domenowe i stałe

**`86523bf`** feat: add core types and config constants (2 pliki)

Centralny system typów w `types/index.ts` — `EmailThread`, `EmailMessage`, `EmailParticipant`, `EmailAttachment`. Stałe API w `config/constants.ts` z quota units per endpoint.

## 1.3 Autentykacja Google OAuth

**`90dd82b`** feat: add authentication with Google OAuth (2 pliki)

- `features/auth/oauthService.ts` — zarządzanie tokenami OAuth z `expo-secure-store`
- 60-sekundowy bufor przed wygaśnięciem → preemptive refresh
- `store/authStore.ts` — Zustand store dla stanu auth (synchroniczny dostęp)

## 1.4 Klient Gmail API

**`ad0f6b3`** feat: add Gmail API integration (18 plików)

Największy pojedynczy commit — cały moduł `features/gmail/`:
- **`api.ts`** — trzypoziomowy klient HTTP z auto token refresh i cache
- **`threads.ts`** — mapowanie surowych danych Gmail na typy domenowe
- **`sync.ts`** — dwa tryby: full sync (pierwsze uruchomienie) + incremental (History API)
- **`hooks.ts`** — React Query hooks (`useThreads`, `useSync`, `useMessages`)
- **Helpery:** `address.ts` (parsowanie adresów), `encoding.ts` (MIME encoded-words), `mime.ts` (nagłówki/body/tworzenie raw email), `batch.ts` (multipart parser)

## 1.5 Generowanie emaili AI

**`4185261`** feat: add AI email generation via Z.AI (1 plik)

Integracja z Z.AI (model GLM) do generowania odpowiedzi i emaili:
- `features/ai/api.ts` — `chatCompletion`, `generateReply`, `generateEmail`
- Automatyczne dopasowanie języka do oryginału (via prompt)
- Temperature 0.7, timeout 30s z AbortController
