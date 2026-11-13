import { apiClient, unwrapApiResponse } from '../../../api/client';
import type { LoyaltyDto } from '../../../api/types';

export async function fetchMyLoyalty(): Promise<LoyaltyDto> {
  return unwrapApiResponse<LoyaltyDto>(
    apiClient.GET('/api/v1/loyalty/me') as Promise<{
      data?: LoyaltyDto;
      error?: unknown;
      response: Response;
    }>,
  );
}

export async function fetchMyReferrals(): Promise<{
  referralCode: string;
  referrals: unknown[];
}> {
  return unwrapApiResponse<{ referralCode: string; referrals: unknown[] }>(
    apiClient.GET('/api/v1/referrals/me') as Promise<{
      data?: { referralCode: string; referrals: unknown[] };
      error?: unknown;
      response: Response;
    }>,
  );
}

export async function recordConsent(input: {
  type: 'terms' | 'privacy' | 'marketing_sms' | 'marketing_push' | 'marketing_email';
  granted: boolean;
  source: string;
  version: string;
}): Promise<{ consent: unknown }> {
  return unwrapApiResponse<{ consent: unknown }>(
    apiClient.POST('/api/v1/consents', {
      body: input,
    }) as Promise<{ data?: { consent: unknown }; error?: unknown; response: Response }>,
  );
}
