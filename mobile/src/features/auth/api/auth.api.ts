import type { SupportedLanguage } from '@kardesler/shared';
import type { QueryClient } from '@tanstack/react-query';
import { apiClient, sessionTokenStore, unwrapApiResponse } from '../../../api/client';
import type { UserProfileDto } from '../../../api/types';
import { secureStorage } from '../../../lib/secure-storage';
import { useAuthStore } from '../model/auth.store';

export async function requestCustomerOtp(phone: string): Promise<{ expiresInSeconds: number }> {
  return unwrapApiResponse<{ expiresInSeconds: number }>(
    apiClient.POST('/api/v1/auth/customer/otp/request', {
      body: { phone },
    }) as Promise<{ data?: { expiresInSeconds: number }; error?: unknown; response: Response }>,
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

export async function updateMyProfile(input: {
  name?: string;
  email?: string | null;
  preferredLanguage?: SupportedLanguage;
}): Promise<UserProfileDto> {
  const updated = await unwrapApiResponse<UserProfileDto>(
    apiClient.PATCH('/api/v1/users/me', {
      body: input,
    }) as Promise<{ data?: UserProfileDto; error?: unknown; response: Response }>,
  );
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
