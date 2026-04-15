// Pre-define globals that expo's WinterCG runtime tries to lazy-load via require()
// which triggers jest's "import outside test scope" error
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value));
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

// franc-min is pure ESM; Jest cannot parse its `import` syntax natively.
jest.mock('franc-min', () => ({
  franc: jest.fn((text: string) => {
    if (!text || text.length < 20) return 'und';
    if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text)) return 'pol';
    return 'eng';
  }),
  francAll: jest.fn((text: string) => {
    if (!text || text.length < 20) return [['und', 1]];
    if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text)) {
      return [
        ['pol', 0.95],
        ['ces', 0.5],
      ];
    }
    return [
      ['eng', 0.9],
      ['deu', 0.3],
    ];
  }),
}));

// onnxruntime-react-native is a native module not installed in the Jest
// environment. Stub it so modules that import it can resolve.
jest.mock(
  'onnxruntime-react-native',
  () => {
    class MockTensor {
      readonly type: string;
      readonly data: unknown;
      readonly dims: readonly number[];
      constructor(type: string, data: unknown, dims: readonly number[]) {
        this.type = type;
        this.data = data;
        this.dims = dims;
      }
    }
    return {
      InferenceSession: {
        create: jest.fn(async () => ({
          run: jest.fn(async () => ({})),
          release: jest.fn(async () => undefined),
          inputNames: ['input_ids', 'attention_mask', 'token_type_ids'],
          outputNames: ['logits'],
        })),
      },
      Tensor: MockTensor,
    };
  },
  { virtual: true },
);

jest.mock('@/src/shared/services/sentry', () => ({
  Sentry: {
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    addBreadcrumb: jest.fn(),
    startSpan: jest.fn((_opts: unknown, fn: () => unknown) => fn()),
    wrap: jest.fn((c: unknown) => c),
    ErrorBoundary: jest.fn(({ children }: { children: unknown }) => children),
  },
  initSentry: jest.fn(),
  navigationIntegration: { registerNavigationContainer: jest.fn() },
}));

jest.mock('@/src/shared/services/resourceLock', () => ({
  acquireAI: jest.fn(() => Promise.resolve(jest.fn())),
  acquireNetwork: jest.fn(() => Promise.resolve(jest.fn())),
  registerLocalAICheck: jest.fn(),
  isAIActive: jest.fn(() => false),
}));
