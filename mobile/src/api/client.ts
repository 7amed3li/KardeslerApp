import Constants from 'expo-constants';
import createClient from 'openapi-fetch';
import { Platform } from 'react-native';
import { logger } from '../lib/logger';
import { secureStorage } from '../lib/secure-storage';
import { ApiClientError, normalizeApiError } from './errors';
import type { paths } from './generated/schema';

export function resolveApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  const extraUrl = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  if (extraUrl && extraUrl !== 'http://127.0.0.1:4000') {
    return extraUrl;
  }
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host) {
      return `http://${host}:4000`;
    }
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:4000';
  }
  return 'http://127.0.0.1:4000';
}

let inMemoryAccessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
let onSessionExpiredCallback: (() => void) | null = null;

export const sessionTokenStore = {
  getAccessToken(): string | null {
    return inMemoryAccessToken;
  },
  setAccessToken(token: string | null): void {
    inMemoryAccessToken = token;
  },
  onSessionExpired(cb: () => void): void {
    onSessionExpiredCallback = cb;
  },
  clearMemory(): void {
    inMemoryAccessToken = null;
  },
};

function generateRequestId(): string {
  return `mob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function performSingleFlightRefresh(baseUrl: string): Promise<string | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      const refreshToken = await secureStorage.getRefreshToken();
      if (!refreshToken) {
        sessionTokenStore.clearMemory();
        return null;
      }

      const res = await fetch(`${baseUrl}/api/v1/auth/customer/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': generateRequestId(),
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        await secureStorage.clearRefreshToken();
        sessionTokenStore.clearMemory();
        onSessionExpiredCallback?.();
        return null;
      }

      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      sessionTokenStore.setAccessToken(data.accessToken);
      await secureStorage.setRefreshToken(data.refreshToken);
      return data.accessToken;
    } catch (err) {
      logger.warn('Refresh token failed', { err: err instanceof Error ? err.message : 'unknown' });
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export function createApiClient(baseUrlOverride?: string) {
  const baseUrl = baseUrlOverride ?? resolveApiBaseUrl();

  const rawClient = createClient<paths>({
    baseUrl,
    fetch: async (input) => {
      const req = input instanceof Request ? input : new Request(input);
      const headers = new Headers(req.headers);
      if (!headers.has('x-request-id')) {
        headers.set('x-request-id', generateRequestId());
      }
      if (inMemoryAccessToken && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${inMemoryAccessToken}`);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);

      try {
        const res = await fetch(new Request(req, { headers }), {
          signal: controller.signal,
        });

        if (res.status === 401 && !req.url.includes('/auth/customer/')) {
          const nextToken = await performSingleFlightRefresh(baseUrl);
          if (nextToken) {
            const retryHeaders = new Headers(headers);
            retryHeaders.set('Authorization', `Bearer ${nextToken}`);
            retryHeaders.set('x-request-id', generateRequestId());
            return await fetch(new Request(req.url, {
              method: req.method,
              headers: retryHeaders,
              body: req.body,
            }));
          }
        }
        return res;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new ApiClientError({
            code: 'TIMEOUT',
            message: 'Request timed out',
            status: 408,
          });
        }
        throw new ApiClientError({
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Network error',
          status: 0,
        });
      } finally {
        clearTimeout(timer);
      }
    },
  });

  return rawClient;
}

export const apiClient = createApiClient();

export async function unwrapApiResponse<T>(
  promise: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await promise;
  if (!response.ok || error !== undefined) {
    throw normalizeApiError(error, response.status);
  }
  return data as T;
}

export async function bootstrapSession(baseUrlOverride?: string): Promise<boolean> {
  const baseUrl = baseUrlOverride ?? resolveApiBaseUrl();
  const token = await performSingleFlightRefresh(baseUrl);
  return token !== null;
}

