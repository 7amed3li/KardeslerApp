import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { sessionTokenStore } from '../src/api/client';
import { useAuthStore } from '../src/features/auth/model/auth.store';
import {
  getGoogleOAuthConfig,
  parseGoogleCallbackUrl,
  runGooglePkceFlow,
} from '../src/features/auth/model/google-auth';
import { AuthModalScreen } from '../src/features/auth/ui/AuthModalScreen';
import { useLanguageStore } from '../src/i18n';
import { secureStorage } from '../src/lib/secure-storage';
import { ThemeProvider } from '../src/ui/themes/ThemeProvider';

const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    canGoBack: () => true,
    back: mockBack,
    replace: mockReplace,
    push: jest.fn(),
  }),
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  getRandomBytes: jest.fn((len: number) => new Uint8Array(len).fill(7)),
  digestStringAsync: jest.fn(async () => 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY='),
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

const mockExchangeGoogleCode = jest.fn();
jest.mock('../src/features/auth/api/auth.api', () => {
  const actual = jest.requireActual('../src/features/auth/api/auth.api');
  return {
    ...actual,
    exchangeGoogleCode: (...args: unknown[]) => mockExchangeGoogleCode(...args),
  };
});

function renderAuthModal() {
  return render(
    <ThemeProvider>
      <AuthModalScreen />
    </ThemeProvider>,
  );
}

describe('Phase 8: Google Sign-In UI, PKCE Callback Validation & Token Storage', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: 'ios-client-123.apps.googleusercontent.com',
      EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: 'android-client-123.apps.googleusercontent.com',
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web-client-123.apps.googleusercontent.com',
      EXPO_PUBLIC_GOOGLE_REDIRECT_URI: 'kardesler://auth/callback',
    };
    useAuthStore.getState().clearAuth();
    sessionTokenStore.clearMemory();
    useLanguageStore.getState().setLanguage('tr');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('renders localized Google primary CTA in TR, EN, and AR with phone OTP collapsed by default', () => {
    const { rerender } = renderAuthModal();
    expect(screen.getByText('Google ile devam et')).toBeTruthy();
    expect(screen.queryByTestId('phone-input')).toBeNull();

    act(() => {
      useLanguageStore.getState().setLanguage('en');
    });
    rerender(
      <ThemeProvider>
        <AuthModalScreen />
      </ThemeProvider>,
    );
    expect(screen.getByText('Continue with Google')).toBeTruthy();

    act(() => {
      useLanguageStore.getState().setLanguage('ar');
    });
    rerender(
      <ThemeProvider>
        <AuthModalScreen />
      </ThemeProvider>,
    );
    expect(screen.getByText('المتابعة باستخدام Google')).toBeTruthy();
  });

  it('validates Google callback URLs strictly and rejects state mismatch or untrusted redirects', async () => {
    const expectedRedirect = 'kardesler://auth/callback';
    const expectedState = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH';

    expect(
      parseGoogleCallbackUrl(`${expectedRedirect}?code=valid_code_123&state=${expectedState}`, expectedRedirect, expectedState),
    ).toEqual({ status: 'ok', code: 'valid_code_123' });

    expect(
      parseGoogleCallbackUrl(`${expectedRedirect}?code=valid_code_123&state=wrong_state`, expectedRedirect, expectedState),
    ).toEqual({ status: 'error', reason: 'state_mismatch' });

    expect(
      parseGoogleCallbackUrl(`https://evil.example.com/auth/callback?code=c&state=${expectedState}`, expectedRedirect, expectedState),
    ).toEqual({ status: 'error', reason: 'untrusted_redirect' });

    expect(
      parseGoogleCallbackUrl(`${expectedRedirect}?error=access_denied`, expectedRedirect, expectedState),
    ).toEqual({ status: 'cancelled' });

    expect(
      parseGoogleCallbackUrl(`${expectedRedirect}?error=server_error`, expectedRedirect, expectedState),
    ).toEqual({ status: 'error', reason: 'provider_error' });

    expect(
      parseGoogleCallbackUrl(`${expectedRedirect}?state=${expectedState}`, expectedRedirect, expectedState),
    ).toEqual({ status: 'error', reason: 'missing_code' });

    expect(parseGoogleCallbackUrl('not-a-url', expectedRedirect, expectedState)).toEqual({
      status: 'error',
      reason: 'invalid_callback_url',
    });

    expect(getGoogleOAuthConfig('ios')?.clientId).toBe('ios-client-123.apps.googleusercontent.com');
    expect(getGoogleOAuthConfig('android')?.clientId).toBe('android-client-123.apps.googleusercontent.com');
    expect(getGoogleOAuthConfig('web')?.clientId).toBe('web-client-123.apps.googleusercontent.com');

    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = '';
    expect(getGoogleOAuthConfig('web')).toBeNull();
    await expect(runGooglePkceFlow('web')).resolves.toEqual({ status: 'not_configured' });
  });

  it('guards against double-taps and handles user cancellation + retry cleanly', async () => {
    let resolveBrowser!: (val: { type: 'cancel' }) => void;
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockImplementation(
      () =>
        new Promise((res) => {
          resolveBrowser = res;
        }),
    );

    renderAuthModal();
    const btn = screen.getByTestId('google-signin-btn');

    fireEvent.press(btn);
    fireEvent.press(btn);
    await waitFor(() => {
      expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledTimes(1);
    });

    resolveBrowser({ type: 'cancel' });
    await waitFor(() => {
      expect(screen.getByTestId('auth-error')).toBeTruthy();
    });

    // Retry succeeds
    const state = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH';
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
      type: 'success',
      url: `kardesler://auth/callback?code=auth_code_retry_123&state=${state}`,
    });
    mockExchangeGoogleCode.mockResolvedValueOnce({
      accessToken: 'jwt_access',
      refreshToken: 'rt_secret_refresh',
      isNewUser: true,
      user: { id: 'u-1', phone: null, name: 'Test User', email: 'test@example.com', referralCode: 'KC1234' },
    });

    fireEvent.press(btn);
    await waitFor(() => {
      expect(mockExchangeGoogleCode).toHaveBeenCalledTimes(1);
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  it('persists refresh token only in secureStorage and access token only in memory on exchange', async () => {
    const setRefreshSpy = jest.spyOn(secureStorage, 'setRefreshToken').mockResolvedValue();
    const actualAuth = jest.requireActual('../src/features/auth/api/auth.api') as typeof import('../src/features/auth/api/auth.api');

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'mem_access_jwt',
          refreshToken: 'sec_refresh_tok',
          isNewUser: true,
          user: { id: 'u-google-1', phone: null, name: 'Ayse', email: 'ayse@example.com', referralCode: 'KC9999' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    try {
      await actualAuth.exchangeGoogleCode({
        code: 'code_1234',
        codeVerifier: 'v'.repeat(43),
        redirectUri: 'kardesler://auth/callback',
        clientId: 'ios-client-123.apps.googleusercontent.com',
        nonce: 'n'.repeat(24),
      });

      expect(sessionTokenStore.getAccessToken()).toBe('mem_access_jwt');
      expect(setRefreshSpy).toHaveBeenCalledWith('sec_refresh_tok');
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().user?.phone).toBeNull();
    } finally {
      global.fetch = originalFetch;
      setRefreshSpy.mockRestore();
    }
  });
});

