# Mail App

React Native email client built with Expo SDK 54. Connects to Gmail API, supports AI-powered email summaries and generation (cloud + on-device), offline TTS playlist for unread emails, and email statistics.

## Tech Stack

- **Framework:** Expo SDK 54, React Native, React 19
- **Routing:** Expo Router (file-based, typed routes)
- **Styling:** Tailwind CSS via UniWind
- **State:** Zustand + SecureStore (auth, settings), React Query (server data)
- **Database:** SQLite + Drizzle ORM (WAL mode, auto-migrations)
- **Auth:** Google Sign-In with OAuth 2.0
- **AI Cloud:** Z.AI (glm-4.7-flashx) for email generation and summaries
- **AI Local:** llama.rn (llama.cpp) with GGUF models (Llama 3.2 3B, Bielik 4.5B, Qwen 3 4B)
- **TTS:** Offline Polish/English text-to-speech via sherpa-onnx (VITS-Piper models)

## Features

- Google OAuth login
- Gmail inbox with thread view and incremental sync (History API)
- Compose, reply, and send emails
- AI-assisted email drafting and summaries (cloud or on-device)
- On-device LLM inference with downloadable GGUF models
- Offline TTS playlist for unread email summaries (auto language detection)
- Email statistics and contact ranking
- Label management
- Rate-limited Gmail API with exponential backoff

## Getting Started

1. Install dependencies

   ```bash
   bun install
   ```

2. Set up environment

   ```bash
   cp .env.example .env
   # Add EXPO_PUBLIC_ZAI_API_KEY for cloud AI features
   ```

3. Run on device or simulator (development build required)

   ```bash
   bun run ios
   bun run android
   ```

> **Note:** Expo Go is not supported. Native modules (Google Sign-In, llama.rn, sherpa-onnx TTS) require a development build via `npx expo run:ios` or EAS Build.

## Project Structure

```
app/                    # Screens (Expo Router file-based routing)
  _layout.tsx           # Root layout: DB migrations, auth guard, providers
  (tabs)/               # Bottom tabs: Inbox, Stats, Settings
  thread/[id].tsx       # Thread detail
  compose.tsx           # Compose email
  summary.tsx           # AI email summaries
features/
  ai/                   # AI providers (cloud Z.AI + local llama.rn)
    providers/           # Cloud and local provider implementations
    LocalModelManager.tsx # Model download/management UI
    modelDownloader.ts   # GGUF model download from HuggingFace
  auth/                 # Google OAuth service
  gmail/                # Gmail API: messages, threads, labels, sync, batch ops
  stats/                # Bulk email fetching, contact ranking
  tts/                  # Offline TTS: service, queue, player, language detection
db/
  schema.ts             # Drizzle ORM schema (9 tables)
  repositories/         # Data access layer per entity
store/                  # Zustand stores (auth, AI settings, TTS voice)
lib/                    # Rate limiter, query client
drizzle/                # SQL migrations
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun start` | Start Expo dev server (Metro) |
| `bun run ios` | Build and run on iOS simulator |
| `bun run android` | Build and run on Android emulator |
| `bun run lint` | Lint with ESLint |
| `bun run format` | Format with Prettier |
| `bun run format:check` | Check formatting |

## Local AI Models

Downloadable in Settings. Models are stored on-device and run inference via llama.cpp (Metal GPU on iOS).

| Model | Size | Strengths |
|-------|------|-----------|
| Llama 3.2 3B (Meta) | ~2.0 GB | Fast, good general quality |
| Bielik 4.5B v3.0 (PL) | ~2.9 GB | Polish-tuned instruction model |
| Qwen 3 4B (Alibaba) | ~2.7 GB | Strong multilingual + reasoning |
