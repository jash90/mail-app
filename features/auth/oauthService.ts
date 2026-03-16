import { GoogleUser } from '@/store/authStore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY_PREFIX = 'oauth_tokens_';
const TOKEN_EXPIRY_BUFFER_MS = 60_000; // refresh 1 min early

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
  // Remove stored Gmail tokens from SecureStore
  await SecureStore.deleteItemAsync(`${TOKEN_KEY_PREFIX}gmail`);
}

export async function refreshGmailTokens(
  _refreshToken: string,
): Promise<{ access_token: string } | null> {
  try {
    // @react-native-google-signin/google-signin v16 manages refresh
    // internally — calling getTokens() returns a fresh access token.
    const { accessToken } = await GoogleSignin.getTokens();

    if (!accessToken) return null;

    // Persist the refreshed token (1-hour default Google expiry)
    await storeTokens('gmail', {
      access_token: accessToken,
      refresh_token: '', // managed internally by the library
      expiry_time: Date.now() + 3600_000,
      user: null,
    });

    return { access_token: accessToken };
  } catch (e) {
    console.error('[refreshGmailTokens] Token refresh failed:', e);
    return null;
  }
}
