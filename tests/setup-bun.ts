/**
 * Bun-native test runner preload — defines globals that Expo/RN expect.
 * For full test suite, prefer `bun run test` (Jest via jest-expo).
 */
// @ts-expect-error -- RN global
globalThis.__DEV__ = true;

if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value));
}

// @ts-expect-error -- expo's import.meta registry polyfill
globalThis.__ExpoImportMetaRegistry = {};
