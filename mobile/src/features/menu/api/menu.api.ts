import type { SupportedLanguage } from '@kardesler/shared';
import { apiClient, unwrapApiResponse } from '../../../api/client';
import type {
  BannerDto,
  DeliveryCheckDto,
  MenuResponseDto,
  PublicSettingsDto,
} from '../../../api/types';

export async function fetchMenu(lang: SupportedLanguage): Promise<MenuResponseDto> {
  return unwrapApiResponse<MenuResponseDto>(
    apiClient.GET('/api/v1/menu', {
      params: { query: { lang } } as never,
    }) as Promise<{ data?: MenuResponseDto; error?: unknown; response: Response }>,
  );
}

export async function fetchBanners(): Promise<{ banners: BannerDto[] }> {
  return unwrapApiResponse<{ banners: BannerDto[] }>(
    apiClient.GET('/api/v1/banners') as Promise<{
      data?: { banners: BannerDto[] };
      error?: unknown;
      response: Response;
    }>,
  );
}

export async function fetchPublicSettings(): Promise<PublicSettingsDto> {
  return unwrapApiResponse<PublicSettingsDto>(
    apiClient.GET('/api/v1/settings/public') as Promise<{
      data?: PublicSettingsDto;
      error?: unknown;
      response: Response;
    }>,
  );
}

export async function checkDeliveryCoverage(lat: number, lng: number): Promise<DeliveryCheckDto> {
  return unwrapApiResponse<DeliveryCheckDto>(
    apiClient.POST('/api/v1/delivery/check', {
      body: { lat, lng },
    }) as Promise<{ data?: DeliveryCheckDto; error?: unknown; response: Response }>,
  );
}
