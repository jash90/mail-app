import { Sentry } from '@/lib/sentry';
import { GoogleUser } from '@/store/authStore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY_PREFIX = 'oauth_tokens_';
export const TOKEN_EXPIRY_BUFFER_MS = 60_000;
export const TOKEN_LIFETIME_MS = 3_600_000;

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
    const isSignedIn = await GoogleSignin.hasPreviousSignIn();
    if (!isSignedIn) {
      await GoogleSignin.signInSilently();
    }

    const [{ accessToken }, existing] = await Promise.all([
      GoogleSignin.getTokens(),
      getStoredTokens('gmail'),
    ]);
    if (!accessToken) return null;

    const expiryTime = Date.now() + TOKEN_LIFETIME_MS;

    await storeTokens('gmail', {
      access_token: accessToken,
      refresh_token: '',
      expiry_time: expiryTime,
      user: existing?.user ?? null,
    });

    return { access_token: accessToken, expiry_time: expiryTime };
  } catch (e) {
    Sentry.captureException(e);
    console.error('[refreshGmailTokens] Token refresh failed:', e);
    return null;
  }
}

export async function initializeTokens(): Promise<void> {
  const tokens = await getStoredTokens('gmail');
  if (!tokens) return;
  if (isTokenExpired(tokens)) {
    await refreshGmailTokens();
  }
}
