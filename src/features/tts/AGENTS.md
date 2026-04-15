# AGENTS.md — TTS Feature

<!-- Scope: Rules for features/tts/ — Sherpa ONNX offline TTS, Polish voice, queue playback.
     Convention: Dev.to Feature-Based → features/tts/ with components/ + hooks/ + services/. -->

## Domain

`features/tts/` owns text-to-speech via Sherpa ONNX offline TTS, Polish voice support with language detection, and queue-based email reading. It does not handle Gmail data, AI inference, or statistics.

## Structure

```
features/tts/
├── hooks/
│   ├── useTTSPlayer.ts       # Playback controls (play, pause, stop, seek)
│   ├── useTTSTracks.ts       # TTS track management for email threads
│   ├── useEmailTTSQueue.ts   # Queue-based sequential email reading
│   └── usePolishVoices.ts    # Polish voice listing and selection
├── TTSService.ts             # Service: Sherpa ONNX wrapper, audio synthesis
├── models.ts                 # Service: TTS model definitions and paths
├── detectLang.ts             # Service: language detection (franc-min)
├── types.ts                  # Feature-scoped types
└── index.ts                  # Public barrel
```

## Components (currently in `components/tts/`)

Legacy — migrate on touch to `features/tts/components/`:

| Current location | Files |
|------------------|-------|
| `components/tts/` | `PolishVoiceSelector.tsx`, `TTSPlayerBar.tsx` |

## Rules

- Never import `sherpa-onnx-react-native` outside this module
- Voice selection state lives in `store/polishVoiceStore.ts`
- Language detection uses `franc-min` — don't add alternative detection libraries
- TTS audio synthesis is CPU-intensive — respect `lib/resourceLock.ts` when running alongside other operations
