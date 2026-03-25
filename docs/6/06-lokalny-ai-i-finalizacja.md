# Część 6: Lokalny AI (llama.rn) i finalizacja

**Commity:** `55d30b1` → `08dbd56` → `419e197`
**Zakres:** llama.rn z modelami GGUF, expo-file-system migration, UI polish, finalizacja

---

## 6.1 UI polish

**`55d30b1`** fix: adjust button positioning in ListScreen
**`08dbd56`** style: format code for improved readability

Drobne poprawki layoutu i formatowania przed integracją lokalnego AI.

## 6.2 Lokalny AI provider (llama.rn)

**`419e197`** feat: integrate local AI model support and update dependencies

Powrót lokalnego AI — tym razem oparty na **llama.rn** (llama.cpp bindings) zamiast executorch.

### Nowe zależności
- `llama.rn` — React Native binding llama.cpp z pluginem Expo (Metal GPU na iOS)
- `expo-file-system` — nowe API (`File`/`Directory`/`Paths`) + legacy `createDownloadResumable`

### Architektura

```
Settings UI (LocalModelManager)
  ↓
useLocalModels hook → modelDownloader (HuggingFace GGUF) → File/Directory API
  ↓
aiSettingsStore (Zustand + SecureStore) → getProvider() fabryka
  ↓
LocalLlamaProvider → initLlama({ model, n_ctx: 2048, n_gpu_layers: 99 })
  ↓
context.completion({ messages, temperature: 0.7, n_predict: 512 })
```

### Nowe pliki

| Plik | Opis |
|------|------|
| `features/ai/providers/local.ts` | `createLocalProvider` — cache kontekstu per model, abort support |
| `features/ai/modelDownloader.ts` | Download/delete/check via `File`/`Directory` + legacy `createDownloadResumable` |
| `features/ai/LocalModelManager.tsx` | Self-contained UI: przełącznik Cloud/Local, lista modeli z progress |
| `features/ai/types.ts` | `LocalModel` interface, `LOCAL_MODELS` array |
| `store/aiSettingsStore.ts` | Persist provider + model selection via SecureStore |

### Dostępne modele GGUF

| Model | Rozmiar | Mocne strony |
|-------|---------|--------------|
| Llama 3.2 3B (Meta) | ~2.0 GB | Szybki, dobra ogólna jakość |
| Bielik 4.5B v3.0 (PL) | ~2.9 GB | Polski model instruction-tuned |
| Qwen 3 4B (Alibaba) | ~2.7 GB | Silny wielojęzyczny + reasoning |

### Provider factory (`providers/index.ts`)

```typescript
export function getProvider(): AiProvider {
  const { aiProvider, localModelId } = useAiSettingsStore.getState();
  if (aiProvider === 'local') return createLocalProvider(localModelId);
  return cloudProvider;
}
```

Kontekst llama.cpp jest cache'owany per model — przełączenie modelu zwalnia stary i ładuje nowy. GPU offloading (Metal na iOS) via `n_gpu_layers: 99`.

### expo-file-system migration

Expo SDK 54 deprecjonuje stare API (`getInfoAsync`, `makeDirectoryAsync`). Zastosowano nowe klasy:
- `new File(Paths.document, 'models', filename).exists` — synchroniczne sprawdzanie
- `new Directory(Paths.document, 'models').create({ intermediates: true })` — tworzenie katalogów
- `createDownloadResumable` z `expo-file-system/legacy` — pobieranie z progress callback

### UI w Settings

`LocalModelManager` — self-contained komponent:
- Przełącznik Cloud (Z.AI) ↔ Local (On-Device) — dwa przyciski
- Lista modeli z: nazwa, rozmiar, status (Pobierz / X% / Pobrany / Aktywny)
- Tap → pobierz i aktywuj, long-press → usuń z potwierdzeniem
- Dark theme (className), spójny z resztą settings

---

## Podsumowanie projektu

### Chronologia (42 commity)

| Część | Commity | Zakres |
|-------|---------|--------|
| 1. Fundament | 1–7 | Expo scaffold, typy, OAuth, Gmail API, Z.AI |
| 2. UI | 8–12 | Ekrany, nawigacja, thread WebView, compose |
| 3. SQLite + Stats | 13–18 | Drizzle ORM, cache-first, batch stats, tabs, refactoring |
| 4. Quality + AI | 19–31 | Rate limiter, executorch (dodanie/usunięcie), cloud refactor, Pressable, newsletter |
| 5. TTS + Security | 32–38 | Offline TTS sherpa-onnx, delete all, security, sync |
| 6. Local AI | 39–42 | llama.rn, GGUF modele, expo-file-system, UI polish |

### Stack technologiczny (stan końcowy)

| Warstwa | Technologia |
|---------|-------------|
| Framework | Expo SDK 54, React Native, React 19 |
| Routing | Expo Router (file-based, typed routes) |
| Styling | Tailwind CSS via UniWind |
| State | Zustand + SecureStore, React Query |
| Database | SQLite + Drizzle ORM (WAL, auto-migrations) |
| Auth | Google Sign-In + OAuth 2.0 |
| AI Cloud | Z.AI (glm-4.7-flashx) |
| AI Local | llama.rn (llama.cpp, Metal GPU) |
| TTS | sherpa-onnx (VITS-Piper, PL + EN) |
| Rate limiting | Exponential backoff, Retry-After, jitter |
