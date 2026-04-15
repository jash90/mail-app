# AGENTS.md — AI Feature

<!-- Scope: Rules for features/ai/ — AI inference, provider system, token tracking.
     Convention: Dev.to Feature-Based → features/ai/ with components/ + hooks/ + services/. -->

## Domain

`features/ai/` owns AI inference (cloud + on-device), model management, and token usage tracking. It does not handle Gmail data, TTS, or statistics directly.

## Structure

```
features/ai/
├── hooks/              # React hooks
│   ├── useAICompose.ts
│   ├── useAITokenStats.ts
│   └── useSummaryPipeline.ts
├── providers/          # Service: AI provider implementations
│   ├── cloud.ts
│   ├── local.ts
│   └── index.ts        # getProvider() — abstraction entry point
├── api.ts              # Service: AI generation orchestration
├── cloud-api.ts        # Service: Cloud AI API implementation
├── modelDownloader.ts  # Service: GGUF model download management
├── tokenTracker.ts     # Service: Token usage persistence
├── useLocalModels.ts   # Hook: Local model state and downloads
├── types.ts            # AiProvider, ChatMessage, GenerateOptions, LocalModel
└── index.ts            # Public barrel
```

## Components (currently in `components/ai/` + `components/ai-tokens/`)

Legacy — migrate on touch to `features/ai/components/`:

| Current location | Files |
|------------------|-------|
| `components/ai/` | `LocalModelManager.tsx`, `ModelCard.tsx` |
| `components/ai-tokens/` | `DailyChart.tsx`, `OperationSection.tsx`, `ProviderSection.tsx`, `RecentList.tsx`, `TotalCard.tsx` |

## Rules

- Never import `cloud.ts` or `local.ts` directly — use `getProvider()` from `providers/index.ts`
- Wrap llama.rn or API-specific errors in standard `Error` before throwing to callers
- If AI needs Gmail data, receive it as a parameter from the coordinating screen/hook — never import from `features/gmail/`
- AI inference must acquire `acquireAI()` from `lib/resourceLock.ts` before running on-device
- New AI backends = new file in `providers/` implementing `AiProvider`, registered in `providers/index.ts`
