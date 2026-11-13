import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { paths } from '../src/api/generated/schema';

describe('OpenAPI Contract Verification', () => {
  it('contains all required customer endpoints in openapi.json', () => {
    const openapiPath = join(__dirname, '..', 'src', 'api', 'generated', 'openapi.json');
    const doc = JSON.parse(readFileSync(openapiPath, 'utf8')) as { paths: Record<string, unknown> };
    const requiredCustomerPaths: (keyof paths)[] = [
      '/api/v1/auth/customer/otp/request',
      '/api/v1/auth/customer/otp/verify',
      '/api/v1/auth/customer/refresh',
      '/api/v1/auth/customer/logout',
      '/api/v1/users/me',
      '/api/v1/devices',
      '/api/v1/referrals/me',
      '/api/v1/addresses',
      '/api/v1/addresses/{id}',
      '/api/v1/menu',
      '/api/v1/banners',
      '/api/v1/settings/public',
      '/api/v1/delivery/check',
      '/api/v1/orders/quote',
      '/api/v1/orders',
      '/api/v1/orders/{id}',
      '/api/v1/orders/{id}/cancel',
      '/api/v1/orders/{id}/reorder',
      '/api/v1/orders/{id}/payment-session',
      '/api/v1/loyalty/me',
      '/api/v1/reviews',
      '/api/v1/consents',
    ];

    for (const path of requiredCustomerPaths) {
      expect(doc.paths[path]).toBeDefined();
    }
  });
});

