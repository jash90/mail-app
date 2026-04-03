// Pre-define globals that expo's WinterCG runtime tries to lazy-load via require()
// which triggers jest's "import outside test scope" error
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
}

// @ts-expect-error -- expo's import.meta registry polyfill
globalThis.__ExpoImportMetaRegistry = {};

// Mock native modules that aren't available in Jest environment

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(),
}));

jest.mock('react-native-reanimated', () => ({
  useSharedValue: jest.fn((v: unknown) => ({ value: v })),
  useAnimatedStyle: jest.fn(() => ({})),
  withTiming: jest.fn(),
  withRepeat: jest.fn(),
}));

jest.mock('@/lib/sentry', () => ({
  Sentry: {
    captureException: jest.fn(),
    wrap: jest.fn((c: unknown) => c),
    ErrorBoundary: jest.fn(({ children }: { children: unknown }) => children),
  },
  initSentry: jest.fn(),
  navigationIntegration: { registerNavigationContainer: jest.fn() },
}));
