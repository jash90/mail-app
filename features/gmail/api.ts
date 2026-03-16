import { GMAIL_API } from '@/config/constants';
import {
  getStoredTokens,
  isTokenExpired,
  refreshGmailTokens,
  resetTokens,
} from '@/features/auth/oauthService';
import {
  clearAllCooldowns,
  executeWithRetry,
  waitForCooldown,
  updateThrottleState,
  RetryableError,
  NonRetryableError,
} from '@/lib/rateLimiter';
import { useAuthStore } from '@/store/authStore';

/** Hermes doesn't support AbortSignal.timeout() — polyfill with AbortController + setTimeout. */
const createTimeoutSignal = (ms: number): AbortSignal => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
};

// Single cached token — only one account type (gmail) is supported.
// If multi-account is added, change to Map<string, ...> like refreshPromises.
let cachedToken: { value: string; expiresAt: number } | null = null;
const refreshPromises = new Map<string, Promise<string>>();
let authGeneration = 0;

export const clearTokenCache = () => {
  cachedToken = null;
  refreshPromises.clear();
};

const handleAuthFailure = () => {
  authGeneration++;
  cachedToken = null;
  refreshPromises.clear();
  clearAllCooldowns();
  resetTokens();
  useAuthStore.getState().clearUser();
};

export const getAccessToken = async (
  accountType: string = 'gmail',
): Promise<string> => {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }

  const gen = authGeneration;

  const tokens = await getStoredTokens(accountType);
  if (!tokens) {
    throw new Error('No Gmail tokens found. Please authenticate.');
  }

  if (isTokenExpired(tokens)) {
    const existing = refreshPromises.get(accountType);
    if (existing) return existing;
    const promise = (async () => {
      try {
        const refreshed = await refreshGmailTokens(tokens.refresh_token);
        if (!refreshed) {
          handleAuthFailure();
          throw new Error(
            'Failed to refresh Gmail tokens. Please re-authenticate.',
          );
        }
        if (gen !== authGeneration) {
          throw new Error('Auth state was reset during token refresh');
        }
        cachedToken = {
          value: refreshed.access_token,
          expiresAt: Date.now() + 55 * 60_000,
        };
        return refreshed.access_token;
      } finally {
        refreshPromises.delete(accountType);
      }
    })();
    refreshPromises.set(accountType, promise);
    return promise;
  }

  cachedToken = {
    value: tokens.access_token,
    expiresAt: tokens.expiry_time - 60_000,
  };
  return tokens.access_token;
};

export const apiRequestRaw = async (
  url: string,
  options: RequestInit = {},
): Promise<Response> => {
  return executeWithRetry(async () => {
    const token = await getAccessToken('gmail');
    await waitForCooldown();

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
      signal: options.signal ?? createTimeoutSignal(30_000),
    });

    updateThrottleState(response);

    if (response.status === 401) {
      handleAuthFailure();
      throw new NonRetryableError(
        'Gmail session expired. Please re-authenticate.',
      );
    }

    if (response.status === 403) {
      const body = await response.clone().json().catch(() => ({}));
      const reason = body?.error?.errors?.[0]?.reason;
      if (
        reason === 'rateLimitExceeded' ||
        reason === 'userRateLimitExceeded'
      ) {
        console.warn(`[Gmail API] Rate limit 403: ${reason} — will retry`);
        throw new RetryableError(`Gmail quota exceeded (403)`, response);
      }
      throw new NonRetryableError(body?.error?.message || `API error: 403`);
    }

    if (response.status === 429 || response.status >= 500) {
      throw new RetryableError(`API error: ${response.status}`, response);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new NonRetryableError(
        error.error?.message || `API error: ${response.status}`,
      );
    }

    return response;
  });
};

export const apiRequest = async <T>(
  url: string,
  options: RequestInit = {},
): Promise<T> => {
  const response = await apiRequestRaw(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return response.json();
};

export const gmailRequest = async <T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> => apiRequest<T>(`${GMAIL_API.baseUrl}${endpoint}`, options);
