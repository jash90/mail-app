# Mail App

A mobile email client built with Expo and React Native that connects to Gmail via the Google API.

## Tech Stack

- **Framework:** Expo SDK 54, React Native 0.81, React 19
- **Routing:** Expo Router (file-based, typed routes)
- **Styling:** Tailwind CSS via UniWind
- **State:** Zustand (auth), React Query (server data, MMKV persistence)
- **Auth:** Google Sign-In with OAuth 2.0
- **AI:** Z.AI for email generation

## Features

- Google OAuth login
- Gmail inbox with thread view
- Compose and send emails
- AI-assisted email drafting
- Label management
- Contact autocomplete
- Offline-ready with MMKV-backed query cache

## Getting Started

1. Install dependencies

   ```bash
   bun install
   ```

2. Start the dev server

   ```bash
   bun start
   ```

3. Run on a device or simulator

   ```bash
   bun run ios
   bun run android
   ```

> **Note:** Google Sign-In requires a development build (`expo run:ios` / `expo run:android`). It does not work in Expo Go.

## Project Structure

```
app/                  # Screens (Expo Router file-based routing)
  _layout.tsx         # Root layout with auth guard
  index.tsx           # Splash / loading
  login.tsx           # Google sign-in
  list.tsx            # Inbox
  compose.tsx         # Compose email
  settings.tsx        # Settings
  thread/[id].tsx     # Thread detail
components/           # Shared UI components
config/               # App constants
features/
  ai/                 # AI email generation (Z.AI)
  auth/               # Google OAuth service
  gmail/              # Gmail API: messages, threads, labels, contacts, sync
store/                # Zustand auth store
types/                # Shared TypeScript types
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun start` | Start Expo dev server |
| `bun run ios` | Run on iOS |
| `bun run android` | Run on Android |
| `bun run lint` | Lint with ESLint |
| `bun run format` | Format with Prettier |
