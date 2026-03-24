# Część 5: TTS offline i bezpieczeństwo

**Commity:** `39e3468` → `d9d4a0a` → `96e2ee6` → `9b43fbe` → `4b3e502`
**Zakres:** Offline TTS playlist (sherpa-onnx), detekcja języka, delete all data, security refactor, sync improvements

---

## 5.1 Email summarization

**`39e3468`** refactor: improve API timeout handling and enhance email summarization

Rozbudowa `features/ai/api.ts`:
- `summarizeEmail(threadId, subject, snippet)` — cache 24h w SQLite (`summaryCache`)
- `prefetchSummaries(accountId)` — batch prefetch z retry (max 3 consecutive failures)
- `getSummaryCacheBatch(keys)` — bulk cache lookup

## 5.2 Offline TTS playlist

**`d9d4a0a`** feat: add offline TTS playlist for unread email summaries (#6)

Nowy moduł `features/tts/` z 6 plikami:

| Plik | Opis |
|------|------|
| `TTSService.ts` | Singleton — model download, extract, init, generate WAV, cache |
| `useEmailTTSQueue.ts` | Hook — fetch summaries → detect lang → generate audio → playback queue |
| `TTSPlayerBar.tsx` | UI — play/pause/next/prev/stop, loading indicator, error display |
| `models.ts` | Definicje modeli VITS-Piper (polski + angielski) |
| `detectLang.ts` | Detekcja języka via franc-min + fallback na polskie diakrytyki |
| `index.ts` | Public exports |

### Architektura TTS
```
Unread emails → useEmailTTSQueue → summarize → detectLang → TTSService.getOrGenerateEmailAudio
                                                              ↓
                                                   Model download (sherpa-onnx VITS-Piper)
                                                              ↓
                                                   WAV cache (DocumentDirectory/tts-cache)
                                                              ↓
                                                   expo-audio playback → TTSPlayerBar
```

- **sherpa-onnx** — offline TTS engine z modelami VITS-Piper (~64 MB per model)
- Auto language detection per summary (pl/en)
- Auto-advance z 1s delay między trackami
- Max 20 unread threads

## 5.3 Delete all data

**`96e2ee6`** Feature/delete all data (#9)

Nowa funkcja w settings: "Usuń dane i wyloguj" — czyści:
- SQLite (all tables)
- React Query cache
- TTS audio cache + model deinitialize
- Auth tokens (SecureStore)
- Zustand state

## 5.4 Security i performance refactor

**`9b43fbe`** refactor: improve app security, performance, and code quality

- Przeniesienie authStore na `zustand/middleware/persist` + SecureStore
- Usunięcie hardcodowanych sekretów
- Optymalizacja re-renderów w list screen

## 5.5 TTS improvements i sync

**`4b3e502`** feat: enhance TTS functionality and improve list synchronization

- Polski głos domyślny: `meski_wg_glos-medium` (VITS-Piper)
- Lepszy sync z incremental refresh po pull-to-refresh
- TTSPlayerBar: stabilniejsze przejścia między trackami
