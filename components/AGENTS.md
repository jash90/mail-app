# AGENTS.md — Shared UI Components

<!-- Scope: Rules for components/ — reusable UI building blocks.
     Source: CLAUDE.md conventions, .claude/rules/01 (SRP), 04 (ISP). -->

## One Component Per File

- Every `.tsx` file exports exactly one component.
- Never place inline helper functions, utility functions, or unrelated types alongside a component in the same file.
- If a component needs a helper, extract it into a separate file.

## Styling

- Use Tailwind CSS classes via UniWind (`className` prop).
- Never use inline `StyleSheet.create` when UniWind classes cover the need.
- Refer to `global.css` and `uniwind-types.d.ts` for available tokens.

## Lists

- Always use `@shopify/flash-list` instead of React Native's `FlatList`.

## Charts

- Use `victory-native` with `@shopify/react-native-skia` renderer.

## Hook Return Types

- Hooks consumed by components return only what the component needs — not internal refs, retry functions, or cache keys.
- If a component only needs `isLoading` and `data`, the hook must not also expose unrelated internals.

## File Size

- Keep files under 500 lines. If a component file grows past this, it has more than one responsibility — split it.
