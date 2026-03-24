# Część 4: Rate limiter, AI provider i code quality

**Commity:** `115646e` → `7ff61ad` → `2ae2dc4` → `54ec6fd` → `313f2db` → `14429cd` → `bf60fe9` → `62d3ee3` → `67c27d9` → `e2cc9d6` → `4c841ae` → `88656c1` → `98a0067` → `211e68a` → `17e76fe` → `ef56054` → `98cc4ef` → `d007749` → `30f3303`
**Zakres:** Rate limiter, lokalny AI (executorch → usunięcie), cloud API refactor, Pressable migration, Android UI, newsletter detection

---

## 4.1 Thread screen i rate limiter

**`115646e`** refactor: enhance thread screen performance and error handling
**`7ff61ad`** feat: rate limiter with retry + code review fixes (#4)

Centralny rate limiter w `lib/rateLimiter.ts`:
- Exponential backoff: base 1s, max 30s, 5 retries
- Obsługa `Retry-After` header z Gmail API
- Jitter dla unikania thundering herd
- Shared throttle state — jeden limiter dla wszystkich requestów

Integracja z `features/gmail/api.ts` — każdy request przechodzi przez rate limiter.

## 4.2 Lokalny AI provider (executorch) — dodanie i usunięcie

**`2ae2dc4`** feat: add AI provider settings and local model support (#5)
**`67c27d9`** chore: add react-native-executorch dependency
**`e2cc9d6`** chore: update bun.lock with executorch deps

Próba integracji `react-native-executorch` z 10 modelami (Qwen, SmolLM, Llama, Phi, Bielik). Dodano:
- `features/ai/local/` — LocalAIProvider, model-manager, hooks
- `store/aiSettingsStore.ts` — provider/model selection
- UI w settings: przełącznik cloud/local, pobieranie modeli

**`4c841ae`** refactor: remove local AI provider and related functionality

Usunięto executorch — problemy z stabilnością i rozmiarem bundla. Powrót do cloud-only.

## 4.3 Cloud API refactor

**`54ec6fd`** refactor: deduplicate ChatMessage, reuse chatCompletion, fix type safety
**`313f2db`** refactor: remove isAvailable method from AI providers
**`88656c1`** feat: implement cloud API integration for AI chat completion

Konsolidacja AI:
- `features/ai/cloud-api.ts` — dedykowany klient Z.AI (glm-4.7-flashx)
- `features/ai/types.ts` — `AiProvider` interface z `generate(messages, signal)`
- `features/ai/providers/` — fabryka z `getProvider()`
- Timeout 5 min z linked AbortController

## 4.4 Code quality i UI improvements

**`14429cd`** refactor: improve error handling in AI and thread components
**`bf60fe9`** refactor: change exported functions to internal in repositories
**`62d3ee3`** refactor: replace TouchableOpacity with Pressable

Migracja z `TouchableOpacity` na `Pressable` w całej aplikacji — lepsze touch handling, natywna obsługa Android ripple.

## 4.5 Android, timeout i newsletter detection

**`98a0067`** refactor: update Android app icons and layout styles
**`211e68a`** fix: update background color for Android adaptive icons
**`17e76fe`** refactor: enhance data management and error handling
**`ef56054`** style: update tab bar layout
**`98cc4ef`** refactor: optimize thread upsert logic and enhance timeout handling
**`d007749`** refactor: streamline participant upsert process
**`30f3303`** feat: enhance email/thread management with newsletter and auto-reply detection

Detekcja newsletterów i auto-reply via headery: `List-Unsubscribe`, `X-Auto-Response-Suppress`, `Auto-Submitted`. Filtrowanie w statystykach.
