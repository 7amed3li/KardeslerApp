import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { GoogleExchangePayload } from '../api/auth.api';

export interface GoogleOAuthConfig {
  clientId: string;
  redirectUri: string;
}

export type GoogleFlowResult =
  | { status: 'ok'; payload: GoogleExchangePayload }
  | { status: 'cancelled' }
  | { status: 'not_configured' }
  | { status: 'error'; reason: string };

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

const DEFAULT_IOS_CLIENT_ID = '717773080616-cukeglj0gd30f412qtefglr225rhgibi.apps.googleusercontent.com';
const DEFAULT_ANDROID_CLIENT_ID = '717773080616-v8cu51sbfc5e1qdsh6ooe8nfnj9s0arg.apps.googleusercontent.com';
const DEFAULT_WEB_CLIENT_ID = '717773080616-8n5u4e1at0aecotdvkknfiree5lcm5ct.apps.googleusercontent.com';

function toBase64UrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i];
    if (byte !== undefined) {
      binary += String.fromCharCode(byte);
    }
  }
  const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function toBase64UrlFromBase64(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function readEnv(inlined: string | undefined, key: string, fallback: string = ''): string {
  if (inlined !== undefined) return inlined.trim();
  if (process.env[key] !== undefined) return process.env[key]!.trim();
  const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;
  if (extra && extra[key] !== undefined) return extra[key].trim();
  return fallback;
}

export function getGoogleOAuthConfig(platformOs: string = 'web'): GoogleOAuthConfig | null {
  const iosId = readEnv(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID', DEFAULT_IOS_CLIENT_ID);
  const androidId = readEnv(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID, 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID', DEFAULT_ANDROID_CLIENT_ID);
  const webId = readEnv(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', DEFAULT_WEB_CLIENT_ID);
  const configuredRedirect = readEnv(process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI, 'EXPO_PUBLIC_GOOGLE_REDIRECT_URI', 'kardesler://auth/google');

  let clientId = '';
  if (platformOs === 'ios') clientId = iosId;
  else if (platformOs === 'android') clientId = androidId;
  else clientId = webId;

  if (!clientId) return null;

  const redirectUri = configuredRedirect || (platformOs === 'web' ? Linking.createURL('auth/callback') : 'kardesler://auth/google');
  return { clientId, redirectUri };
}

export async function generatePkceAndOidcParams(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
  state: string;
  nonce: string;
}> {
  const verifierBytes = Crypto.getRandomBytes(32);
  const codeVerifier = toBase64UrlFromBytes(verifierBytes);
  const sha256Base64 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  const codeChallenge = toBase64UrlFromBase64(sha256Base64);
  const state = toBase64UrlFromBytes(Crypto.getRandomBytes(24));
  const nonce = toBase64UrlFromBytes(Crypto.getRandomBytes(24));

  return { codeVerifier, codeChallenge, state, nonce };
}

export function parseGoogleCallbackUrl(
  callbackUrl: string,
  expectedRedirectUri: string,
  expectedState: string,
): { status: 'ok'; code: string } | { status: 'cancelled' } | { status: 'error'; reason: string } {
  let parsed: URL;
  let expected: URL;
  try {
    parsed = new URL(callbackUrl);
    expected = new URL(expectedRedirectUri);
  } catch {
    return { status: 'error', reason: 'invalid_callback_url' };
  }

  if (
    parsed.protocol !== expected.protocol ||
    parsed.host !== expected.host ||
    !parsed.pathname.startsWith(expected.pathname)
  ) {
    return { status: 'error', reason: 'untrusted_redirect' };
  }

  const errorParam = parsed.searchParams.get('error');
  if (errorParam === 'access_denied') {
    return { status: 'cancelled' };
  }
  if (errorParam) {
    return { status: 'error', reason: 'provider_error' };
  }

  const stateParam = parsed.searchParams.get('state');
  const codeParam = parsed.searchParams.get('code');
  if (!stateParam || stateParam !== expectedState) {
    return { status: 'error', reason: 'state_mismatch' };
  }
  if (!codeParam || codeParam.trim().length < 4) {
    return { status: 'error', reason: 'missing_code' };
  }

  return { status: 'ok', code: codeParam };
}

export async function runGooglePkceFlow(platformOs: string = 'web'): Promise<GoogleFlowResult> {
  const config = getGoogleOAuthConfig(platformOs);
  if (!config) {
    return { status: 'not_configured' };
  }

  const { codeVerifier, codeChallenge, state, nonce } = await generatePkceAndOidcParams();

  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(
        'kc_google_pkce',
        JSON.stringify({
          codeVerifier,
          state,
          nonce,
          clientId: config.clientId,
          redirectUri: config.redirectUri,
        }),
      );
    } catch {
      // ignore storage quota / sandbox issues
    }
  }

  const authParams = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    prompt: 'select_account',
  });

  const authUrl = `${GOOGLE_AUTH_ENDPOINT}?${authParams.toString()}`;
  const result = await WebBrowser.openAuthSessionAsync(authUrl, config.redirectUri);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { status: 'cancelled' };
  }
  if (result.type !== 'success' || !result.url) {
    return { status: 'error', reason: 'browser_failed' };
  }

  const parsed = parseGoogleCallbackUrl(result.url, config.redirectUri, state);
  if (parsed.status !== 'ok') {
    return parsed;
  }

  return {
    status: 'ok',
    payload: {
      code: parsed.code,
      codeVerifier,
      redirectUri: config.redirectUri,
      clientId: config.clientId,
      nonce,
    },
  };
}
