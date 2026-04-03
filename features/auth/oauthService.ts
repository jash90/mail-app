import { GOOGLE_AUTH } from '@/config/constants';
import { Sentry } from '@/lib/sentry';
import { AuthError } from '@/lib/errors';
import { GoogleUser } from '@/store/authStore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY_PREFIX = 'oauth_tokens_';
export const TOKEN_EXPIRY_BUFFER_MS = 60_000;
export const TOKEN_LIFETIME_MS = 3_600_000;

let googleSignInConfigured = false;

/**
 * Ensure GoogleSignin is configured. Safe to call multiple times.
 * Must be called before any GoogleSignin API usage (getTokens, signInSilently, etc.).
 */
export function ensureGoogleSignInConfigured(): void {
  if (googleSignInConfigured) return;
  GoogleSignin.configure({
    iosClientId: GOOGLE_AUTH.iosClientId,
    scopes: GOOGLE_AUTH.scopes,
  });
  googleSignInConfigured = true;
}

/** Reset GoogleSignin config flag. Call on logout so re-login reconfigures. */
export function resetGoogleSignInConfig(): void {
  googleSignInConfigured = false;
}

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expiry_time: number; // epoch ms
  user: GoogleUser | null;
}

export async function getStoredTokens(
  accountType: string,
): Promise<StoredTokens | null> {
  const raw = await SecureStore.getItemAsync(
    `${TOKEN_KEY_PREFIX}${accountType}`,
  );
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

export function isTokenExpired(tokens: StoredTokens): boolean {
  return Date.now() >= tokens.expiry_time - TOKEN_EXPIRY_BUFFER_MS;
}

export async function storeTokens(
  accountType: string,
  tokens: StoredTokens,
): Promise<void> {
  await SecureStore.setItemAsync(
    `${TOKEN_KEY_PREFIX}${accountType}`,
    JSON.stringify(tokens),
  );
}

export async function resetTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(`${TOKEN_KEY_PREFIX}gmail`);
}

export async function refreshGmailTokens(): Promise<{
  access_token: string;
  expiry_time: number;
} | null> {
  try {
    // Ensure GoogleSignin is configured before any API call
    ensureGoogleSignInConfigured();

    // Try silent sign-in to restore the session if needed
    const currentUser = GoogleSignin.getCurrentUser();
    if (!currentUser) {
      try {
        await GoogleSignin.signInSilently();
      } catch (silentError) {
        // If silent sign-in fails, the user needs to re-authenticate
        console.warn(
          '[refreshGmailTokens] Silent sign-in failed:',
          silentError,
        );
        return null;
      }
    }

    const { accessToken } = await GoogleSignin.getTokens();
    if (!accessToken) return null;

    const existing = await getStoredTokens('gmail');
    const expiryTime = Date.now() + TOKEN_LIFETIME_MS;

    await storeTokens('gmail', {
      access_token: accessToken,
      refresh_token: '',
      expiry_time: expiryTime,
      user: existing?.user ?? null,
    });

    return { access_token: accessToken, expiry_time: expiryTime };
  } catch (e) {
    const authErr = new AuthError('REFRESH_FAILED', 'Token refresh failed', e);
    Sentry.captureException(authErr);
    console.error('[refreshGmailTokens]', authErr.message);
    return null;
  }
}

export async function initializeTokens(): Promise<void> {
  // Always configure GoogleSignin on init so token refresh works
  ensureGoogleSignInConfigured();

  const tokens = await getStoredTokens('gmail');
  if (!tokens) return;
  if (isTokenExpired(tokens)) {
    await refreshGmailTokens();
  }
}
