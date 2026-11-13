import { QueryClient } from '@tanstack/react-query';
import { createApiClient, sessionTokenStore } from '../src/api/client';
import { ApiClientError } from '../src/api/errors';
import {
  deleteMyAccount,
  logoutCustomer,
  verifyCustomerOtp,
} from '../src/features/auth/api/auth.api';
import { useAuthStore } from '../src/features/auth/model/auth.store';
import {
  isValidOtpCode,
  isValidTurkishMobile,
  normalizeTurkishPhone,
} from '../src/features/auth/model/auth.validation';
import { secureStorage } from '../src/lib/secure-storage';

describe('Phase 2 Authentication', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    sessionTokenStore.clearMemory();
    useAuthStore.getState().clearAuth();
    await secureStorage.clearRefreshToken();
  });

  it('normalizes and validates Turkish mobile numbers (+905XXXXXXXXX)', () => {
    expect(normalizeTurkishPhone('0532 123 45 67')).toBe('+905321234567');
    expect(normalizeTurkishPhone('5321234567')).toBe('+905321234567');
    expect(isValidTurkishMobile('5321234567')).toBe(true);
    expect(isValidTurkishMobile('4121234567')).toBe(false);
    expect(isValidOtpCode('145300')).toBe(true);
    expect(isValidOtpCode('1453')).toBe(false);
  });

  it('stores refresh token in SecureStore and access token only in memory on OTP verify', async () => {
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          accessToken: 'acc-1',
          refreshToken: 'ref-1',
          user: { id: 'u1', phone: '+905321234567', name: 'Ali', referralCode: 'KC01' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const res = await verifyCustomerOtp('+905321234567', '145300');
    expect(res.user.id).toBe('u1');
    expect(sessionTokenStore.getAccessToken()).toBe('acc-1');
    expect(await secureStorage.getRefreshToken()).toBe('ref-1');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('performs single-flight refresh when concurrent requests receive 401', async () => {
    await secureStorage.setRefreshToken('old-refresh');
    sessionTokenStore.setAccessToken('expired-access');

    let refreshCount = 0;
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/api/v1/auth/customer/refresh')) {
        refreshCount += 1;
        return new Response(
          JSON.stringify({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const authHeader =
        input instanceof Request ? input.headers.get('Authorization') : undefined;
      if (authHeader === 'Bearer expired-access') {
        return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }), {
          status: 401,
        });
      }
      return new Response(JSON.stringify({ orders: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const client = createApiClient('http://127.0.0.1:4000');
    const [r1, r2] = await Promise.all([
      client.GET('/api/v1/orders'),
      client.GET('/api/v1/addresses'),
    ]);

    expect(r1.response.status).toBe(200);
    expect(r2.response.status).toBe(200);
    expect(refreshCount).toBe(1);
    expect(await secureStorage.getRefreshToken()).toBe('new-refresh');
  });

  it('clears SecureStore, auth store, and query cache on logout and delete account', async () => {
    await secureStorage.setRefreshToken('ref-token');
    sessionTokenStore.setAccessToken('acc-token');
    useAuthStore.getState().setAuthenticated({
      id: 'u1',
      phone: '+905321234567',
      name: 'Ali',
      referralCode: 'KC01',
    });

    const qc = new QueryClient();
    qc.setQueryData(['orders'], [{ id: 'o1' }]);

    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ anonymized: true, message: 'OK' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    await logoutCustomer(qc);
    expect(await secureStorage.getRefreshToken()).toBeNull();
    expect(sessionTokenStore.getAccessToken()).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(qc.getQueryData(['orders'])).toBeUndefined();

    // Test deleteMyAccount throws normalized ApiClientError on failure and clears on success
    await deleteMyAccount(qc);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Slow down' } }), {
        status: 429,
      }),
    ) as unknown as typeof fetch;
    await expect(deleteMyAccount(qc)).rejects.toBeInstanceOf(ApiClientError);
  });
});
