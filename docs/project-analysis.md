# Analiza stanu projektu `mail-app`

**Data:** 2026-04-03

## 📊 Podsumowanie ogólne

| Metryka | Wartość |
|---|---|
| **Łączna ilość kodu** | ~10 030 linii (TS/TSX) |
| **Pliki źródłowe** | ~110 plików |
| **Expo SDK** | 54, React Native 0.81.5, React 19.1 |
| **Lint** | ✅ **0 błędów** (czyste) |
| **TypeScript** | ✅ **0 błędów** (`tsc --noEmit` przechodzi) |
| **Testy** | ❌ Brak suite'a testowego |

---

## ✅ Co jest w dobrym stanie

1. **Czysty build** — lint i typecheck przechodzą bez błędów
2. **Dobrze zmodularyzowana architektura** — feature-driven (`features/gmail`, `features/ai`, `features/tts`, `features/stats`, `features/search`)
3. **Żaden plik nie przekracza 280 linii** — najdłuższy to `db/repositories/messages.ts` (279 linii)
4. **Repozytorium DB rozbite na moduły** — `threads/` podzielone na 5 plików (queries, mutations, hydration, upsert, search)
5. **Niedawne refaktoringi** — widać systematyczne rozbijanie dużych plików (commits o decompose stats, threads repo, SearchModal)
6. **Dobre wzorce**: rate limiter z backoff, React Query z centralnymi query keys, Zustand z SecureStore persistence

---

## ⚠️ Prace w toku (uncommitted changes)

Aktywny refaktoring — **ekstrakcja hooków z ekranów** (Zadanie 3 z `docs/refactoring-plan.md`):

| Plik | Zmiana |
|---|---|
| `app/(tabs)/list.tsx` | -127 linii → wyekstrahowano `useInboxScreen` |
| `app/thread/[id].tsx` | -162 linii → wyekstrahowano `useThreadScreen` |
| `app/summary.tsx` | -137 linii → wyekstrahowano `useSummaryPipeline` |
| `app/compose.tsx` | -93 linii → wyekstrahowano `useAICompose` + `useContactAutocomplete` |
| `app/_layout.tsx` | -8 linii → wyekstrahowano `lib/polyfills.ts` |

**7 nowych plików (untracked):** hooki + polyfills — gotowe do commita.

---

## 🔴 Potencjalne ryzyka / braki

| Obszar | Problem | Priorytet |
|---|---|---|
| **Brak testów** | Zero unit/integration testów — jedyne zabezpieczenie to lint + typecheck | 🔴 Wysoki |
| **Niezmergowane branche** | 4 WIP branches (ExecuTorch, delete-all-data, TTS playlist) — mogą się rozjechać z master | 🟡 Średni |
| **7 zmergowanych branchów** | Remote branches do usunięcia (porządek) | 🟢 Niski |
| **Duplikacja hooków** | `features/gmail/hooks.ts` (223 linii) + nowe `features/gmail/hooks/` — stary plik prawdopodobnie do usunięcia po refaktoringu | 🟡 Średni |
| **`features/gmail/hooks.ts`** | Największy pozostały plik w gmail (223 linii) — kandydat do dalszej dekompozycji | 🟢 Niski |

---

## 📁 Architektura — rozkład kodu

```
features/gmail/     (19 plików) — Gmail API, sync, hooks, helpers
features/tts/       (11 plików) — Text-to-Speech (Sherpa ONNX)
features/ai/        (8 plików)  — AI providers (cloud Z.AI + local llama.rn)
features/stats/     (6 plików)  — Statystyki emaili
features/search/    (5 plików)  — Wyszukiwanie hybrydowe
features/auth/      (1 plik)    — Google OAuth
db/                 (15 plików) — SQLite + Drizzle ORM, repositories
components/         (18 plików) — UI components, skeletons, search, stats
app/                (11 plików) — Expo Router screens + layouts
lib/                (11 plików) — Utilities (rate limiter, sentry, analytics, etc.)
store/              (3 pliki)   — Zustand stores
```

---

## 🎯 Rekomendowane następne kroki

1. **Scommitować bieżący refaktoring** — ekstrakcja hooków jest gotowa (464 linii usunięte z ekranów), 7 nowych plików czeka
2. **Usunąć stary `features/gmail/hooks.ts`** jeśli cała logika przeniesiona do `features/gmail/hooks/`
3. **Wyczyścić 7 zmergowanych branchów** (5 min, zero ryzyka)
4. **Zdecydować o 4 WIP branchach** — kontynuować lub archiwizować
5. **Dodać testy** — największy dług techniczny projektu; krytyczne ścieżki to sync, rate limiter, batch parsing, AI provider switching
