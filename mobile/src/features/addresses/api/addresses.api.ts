import { apiClient, unwrapApiResponse } from '../../../api/client';
import type { AddressDto } from '../../../api/types';

export async function listAddresses(): Promise<{ addresses: AddressDto[] }> {
  return unwrapApiResponse<{ addresses: AddressDto[] }>(
    apiClient.GET('/api/v1/addresses') as Promise<{
      data?: { addresses: AddressDto[] };
      error?: unknown;
      response: Response;
    }>,
  );
}

export async function createAddress(input: {
  label: string;
  fullAddress: string;
  lat: number;
  lng: number;
  building?: string;
  floor?: string;
  apartment?: string;
  notes?: string;
}): Promise<AddressDto> {
  return unwrapApiResponse<AddressDto>(
    apiClient.POST('/api/v1/addresses', {
      body: input,
    }) as Promise<{ data?: AddressDto; error?: unknown; response: Response }>,
  );
}

export async function updateAddress(
  id: string,
  patch: Partial<{
    label: string;
    fullAddress: string;
    lat: number;
    lng: number;
    building: string | null;
    floor: string | null;
    apartment: string | null;
    notes: string | null;
  }>,
): Promise<AddressDto> {
  return unwrapApiResponse<AddressDto>(
    apiClient.PATCH('/api/v1/addresses/{id}', {
      params: { path: { id } },
      body: patch,
    }) as Promise<{ data?: AddressDto; error?: unknown; response: Response }>,
  );
}

export async function deleteAddress(id: string): Promise<{ deleted: boolean }> {
  return unwrapApiResponse<{ deleted: boolean }>(
    apiClient.DELETE('/api/v1/addresses/{id}', {
      params: { path: { id } },
    }) as Promise<{ data?: { deleted: boolean }; error?: unknown; response: Response }>,
  );
}

