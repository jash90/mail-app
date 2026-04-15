import {
  ensureGoogleSignInConfigured,
  resetGoogleSignInConfig,
  getStoredTokens,
  storeTokens,
  resetTokens,
  isTokenExpired,
  refreshGmailTokens,
  initializeTokens,
  TOKEN_EXPIRY_BUFFER_MS,
  TOKEN_LIFETIME_MS,
  type StoredTokens,
} from '@/src/features/auth/services/oauthService';

// ── Mocks ─────────────────────────────────────────────────────────────

const mockConfigure = jest.fn();
const mockGetCurrentUser = jest.fn();
const mockSignInSilently = jest.fn();
const mockGetTokens = jest.fn();

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: (...args: unknown[]) => mockConfigure(...args),
    getCurrentUser: () => mockGetCurrentUser(),
    signInSilently: () => mockSignInSilently(),
    getTokens: () => mockGetTokens(),
  },
}));

const secureStoreData: Record<string, string> = {};

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key: string) =>
    Promise.resolve(secureStoreData[key] ?? null),
  ),
  setItemAsync: jest.fn((key: string, value: string) => {
    secureStoreData[key] = value;
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    delete secureStoreData[key];
    return Promise.resolve();
  }),
}));

jest.mock('@/src/shared/config/constants', () => ({
  GOOGLE_AUTH: {
    iosClientId: 'test-client-id',
    scopes: ['https://www.googleapis.com/auth/gmail.modify'],
  },
}));

jest.mock('@/src/shared/services/sentry', () => ({
  Sentry: { captureException: jest.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────

function makeTokens(overrides: Partial<StoredTokens> = {}): StoredTokens {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expiry_time: Date.now() + TOKEN_LIFETIME_MS,
    user: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Clear secure store
  Object.keys(secureStoreData).forEach((k) => delete secureStoreData[k]);
  // Reset config flag
  resetGoogleSignInConfig();
});

// ── ensureGoogleSignInConfigured ──────────────────────────────────────

describe('ensureGoogleSignInConfigured', () => {
  it('configures GoogleSignin on first call', () => {
    ensureGoogleSignInConfigured();

    expect(mockConfigure).toHaveBeenCalledTimes(1);
    expect(mockConfigure).toHaveBeenCalledWith({
      iosClientId: 'test-client-id',
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });
  });

  it('is idempotent — does not reconfigure on second call', () => {
    ensureGoogleSignInConfigured();
    ensureGoogleSignInConfigured();

    expect(mockConfigure).toHaveBeenCalledTimes(1);
  });

  it('reconfigures after resetGoogleSignInConfig()', () => {
    ensureGoogleSignInConfigured();
    resetGoogleSignInConfig();
    ensureGoogleSignInConfigured();

    expect(mockConfigure).toHaveBeenCalledTimes(2);
  });
});

// ── Token storage ─────────────────────────────────────────────────────

describe('token storage', () => {
  it('stores and retrieves tokens', async () => {
    const tokens = makeTokens();
    await storeTokens('gmail', tokens);

    const retrieved = await getStoredTokens('gmail');
    expect(retrieved).toEqual(tokens);
  });

  it('returns null for missing tokens', async () => {
    const result = await getStoredTokens('gmail');
    expect(result).toBeNull();
  });

  it('returns null for corrupted JSON', async () => {
    secureStoreData['oauth_tokens_gmail'] = '{invalid json';
    const result = await getStoredTokens('gmail');
    expect(result).toBeNull();
  });

  it('deletes tokens on reset', async () => {
    await storeTokens('gmail', makeTokens());
    await resetTokens();

    const result = await getStoredTokens('gmail');
    expect(result).toBeNull();
  });
});

// ── isTokenExpired ────────────────────────────────────────────────────

describe('isTokenExpired', () => {
  it('returns false when token is fresh', () => {
    const tokens = makeTokens({
      expiry_time: Date.now() + TOKEN_LIFETIME_MS,
    });
    expect(isTokenExpired(tokens)).toBe(false);
  });

  it('returns true when token is past expiry', () => {
    const tokens = makeTokens({ expiry_time: Date.now() - 1000 });
    expect(isTokenExpired(tokens)).toBe(true);
  });

  it('returns true within the buffer window', () => {
    const tokens = makeTokens({
      expiry_time: Date.now() + TOKEN_EXPIRY_BUFFER_MS - 1000,
    });
    expect(isTokenExpired(tokens)).toBe(true);
  });

  it('returns false just outside the buffer window', () => {
    const tokens = makeTokens({
      expiry_time: Date.now() + TOKEN_EXPIRY_BUFFER_MS + 5000,
    });
    expect(isTokenExpired(tokens)).toBe(false);
  });
});

// ── refreshGmailTokens ───────────────────────────────────────────────

describe('refreshGmailTokens', () => {
  it('refreshes tokens when current user exists', async () => {
    mockGetCurrentUser.mockReturnValue({ user: { id: '1' } });
    mockGetTokens.mockResolvedValue({ accessToken: 'new-access-token' });

    const result = await refreshGmailTokens();

    expect(result).not.toBeNull();
    expect(result!.access_token).toBe('new-access-token');
    expect(result!.expiry_time).toBeGreaterThan(Date.now());
  });

  it('attempts silent sign-in when no current user', async () => {
    mockGetCurrentUser.mockReturnValue(null);
    mockSignInSilently.mockResolvedValue({ user: { id: '1' } });
    mockGetTokens.mockResolvedValue({ accessToken: 'silent-token' });

    const result = await refreshGmailTokens();

    expect(mockSignInSilently).toHaveBeenCalledTimes(1);
    expect(result!.access_token).toBe('silent-token');
  });

  it('returns null when silent sign-in fails', async () => {
    mockGetCurrentUser.mockReturnValue(null);
    mockSignInSilently.mockRejectedValue(new Error('no session'));

    const result = await refreshGmailTokens();

    expect(result).toBeNull();
  });

  it('returns null when getTokens returns no access token', async () => {
    mockGetCurrentUser.mockReturnValue({ user: { id: '1' } });
    mockGetTokens.mockResolvedValue({ accessToken: '' });

    const result = await refreshGmailTokens();
    expect(result).toBeNull();
  });

  it('persists refreshed tokens to SecureStore', async () => {
    mockGetCurrentUser.mockReturnValue({ user: { id: '1' } });
    mockGetTokens.mockResolvedValue({ accessToken: 'persisted-token' });

    await refreshGmailTokens();

    const stored = await getStoredTokens('gmail');
    expect(stored).not.toBeNull();
    expect(stored!.access_token).toBe('persisted-token');
  });

  it('returns null and captures exception on unexpected error', async () => {
    mockGetCurrentUser.mockImplementation(() => {
      throw new Error('native crash');
    });

    const { Sentry } = require('@/src/shared/services/sentry');
    const result = await refreshGmailTokens();

    expect(result).toBeNull();
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

// ── initializeTokens ─────────────────────────────────────────────────

describe('initializeTokens', () => {
  it('configures GoogleSignin', async () => {
    await initializeTokens();
    expect(mockConfigure).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no stored tokens exist', async () => {
    await initializeTokens();
    expect(mockGetTokens).not.toHaveBeenCalled();
  });

  it('refreshes expired tokens on init', async () => {
    const expiredTokens = makeTokens({ expiry_time: Date.now() - 10_000 });
    await storeTokens('gmail', expiredTokens);

    mockGetCurrentUser.mockReturnValue({ user: { id: '1' } });
    mockGetTokens.mockResolvedValue({ accessToken: 'refreshed' });

    await initializeTokens();

    expect(mockGetTokens).toHaveBeenCalledTimes(1);
  });

  it('skips refresh for fresh tokens', async () => {
    const freshTokens = makeTokens({
      expiry_time: Date.now() + TOKEN_LIFETIME_MS,
    });
    await storeTokens('gmail', freshTokens);

    await initializeTokens();

    expect(mockGetTokens).not.toHaveBeenCalled();
  });
});
