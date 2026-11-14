import type { SupportedLanguage } from '@kardesler/shared';
import type { QueryClient } from '@tanstack/react-query';
import { apiClient, sessionTokenStore, unwrapApiResponse } from '../../../api/client';
import type { UserProfileDto } from '../../../api/types';
import { secureStorage } from '../../../lib/secure-storage';
import { useAuthStore } from '../model/auth.store';

export async function requestCustomerOtp(phone: string): Promise<{ expiresInSeconds: number; demoCode?: string }> {
  return unwrapApiResponse<{ expiresInSeconds: number; demoCode?: string }>(
    apiClient.POST('/api/v1/auth/customer/otp/request', {
      body: { phone },
    }) as Promise<{ data?: { expiresInSeconds: number; demoCode?: string }; error?: unknown; response: Response }>,
  );
}

export interface VerifyOtpResult {
  accessToken: string;
  refreshToken: string;
  user: UserProfileDto;
}

export async function verifyCustomerOtp(phone: string, code: string): Promise<VerifyOtpResult> {
  const result = await unwrapApiResponse<VerifyOtpResult>(
    apiClient.POST('/api/v1/auth/customer/otp/verify', {
      body: { phone, code },
    }) as Promise<{ data?: VerifyOtpResult; error?: unknown; response: Response }>,
  );

  sessionTokenStore.setAccessToken(result.accessToken);
  await secureStorage.setRefreshToken(result.refreshToken);
  useAuthStore.getState().setAuthenticated(result.user);
  return result;
}

export interface GoogleExchangePayload {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  nonce: string;
}

export interface GoogleExchangeResult {
  accessToken: string;
  refreshToken: string;
  isNewUser: boolean;
  user: UserProfileDto;
}

export async function exchangeGoogleCode(payload: GoogleExchangePayload): Promise<GoogleExchangeResult> {
  const result = await unwrapApiResponse<GoogleExchangeResult>(
    apiClient.POST('/api/v1/auth/customer/google/exchange', {
      body: payload,
    }) as Promise<{ data?: GoogleExchangeResult; error?: unknown; response: Response }>,
  );

  sessionTokenStore.setAccessToken(result.accessToken);
  await secureStorage.setRefreshToken(result.refreshToken);
  useAuthStore.getState().setAuthenticated(result.user);
  return result;
}

export async function linkGoogleIdentity(
  payload: GoogleExchangePayload,
): Promise<{ linked: boolean; provider: 'google'; email: string | null }> {
  return unwrapApiResponse<{ linked: boolean; provider: 'google'; email: string | null }>(
    apiClient.POST('/api/v1/auth/customer/google/link', {
      body: payload,
    }) as Promise<{
      data?: { linked: boolean; provider: 'google'; email: string | null };
      error?: unknown;
      response: Response;
    }>,
  );
}

export interface CustomerIdentityDto {
  provider: string;
  emailAtLink: string | null;
  createdAt: string;
}

export async function listCustomerIdentities(): Promise<{ identities: CustomerIdentityDto[] }> {
  return unwrapApiResponse<{ identities: CustomerIdentityDto[] }>(
    apiClient.GET('/api/v1/auth/customer/identities') as Promise<{
      data?: { identities: CustomerIdentityDto[] };
      error?: unknown;
      response: Response;
    }>,
  );
}

export async function unlinkCustomerIdentity(
  provider: 'google',
): Promise<{ unlinked: boolean; provider: string }> {
  return unwrapApiResponse<{ unlinked: boolean; provider: string }>(
    apiClient.DELETE('/api/v1/auth/customer/identities/{provider}', {
      params: { path: { provider } },
    }) as Promise<{
      data?: { unlinked: boolean; provider: string };
      error?: unknown;
      response: Response;
    }>,
  );
}

export async function updateMyProfile(input: {
  name?: string;
  email?: string | null;
  phone?: string | null;
  preferredLanguage?: SupportedLanguage;
}): Promise<UserProfileDto> {
  const res = await unwrapApiResponse<{ user?: UserProfileDto } & Partial<UserProfileDto>>(
    apiClient.PATCH('/api/v1/users/me', {
      body: input,
    }) as Promise<{ data?: { user?: UserProfileDto } & Partial<UserProfileDto>; error?: unknown; response: Response }>,
  );
  const updated = (res.user ?? res) as UserProfileDto;
  useAuthStore.getState().updateUser(updated);
  return updated;
}

export async function logoutCustomer(queryClient: QueryClient): Promise<void> {
  const refreshToken = await secureStorage.getRefreshToken();
  try {
    await apiClient.POST('/api/v1/auth/customer/logout', {
      body: (refreshToken ? { refreshToken } : {}) as never,
    });
  } catch {
    // Always clear local session even if server call fails
  } finally {
    await secureStorage.clearRefreshToken();
    await secureStorage.clearLastPushToken();
    sessionTokenStore.clearMemory();
    useAuthStore.getState().clearAuth();
    queryClient.clear();
  }
}

export async function deleteMyAccount(queryClient: QueryClient): Promise<void> {
  await unwrapApiResponse<{ anonymized: boolean; message: string }>(
    apiClient.DELETE('/api/v1/users/me') as Promise<{
      data?: { anonymized: boolean; message: string };
      error?: unknown;
      response: Response;
    }>,
  );
  await secureStorage.clearRefreshToken();
  await secureStorage.clearLastPushToken();
  sessionTokenStore.clearMemory();
  useAuthStore.getState().clearAuth();
  queryClient.clear();
}
