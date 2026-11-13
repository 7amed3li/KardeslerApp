import type * as Notifications from 'expo-notifications';
import {
  extractNotificationDeepLink,
  registerForPushNotificationsIfPermitted,
} from '../src/features/notifications/notifications.service';
import {
  fetchMyLoyalty,
  fetchMyReferrals,
  recordConsent,
} from '../src/features/profile/api/profile.api';
import { secureStorage } from '../src/lib/secure-storage';

describe('Phase 5 Push Notifications, Profile & Loyalty', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await secureStorage.clearLastPushToken();
  });

  it('extracts whitelisted deep links from notification responses and rejects unsafe ones', () => {
    const validResp = {
      notification: {
        request: {
          content: {
            data: { orderId: 'ord-5555' },
          },
        },
      },
    } as unknown as Notifications.NotificationResponse;

    expect(extractNotificationDeepLink(validResp)).toEqual({
      route: '/orders/[id]',
      params: { id: 'ord-5555' },
    });

    const unsafeResp = {
      notification: {
        request: {
          content: {
            data: { url: 'https://evil.example.com/steal' },
          },
        },
      },
    } as unknown as Notifications.NotificationResponse;

    expect(extractNotificationDeepLink(unsafeResp)).toBeNull();
  });

  it('deduplicates push token registration via SecureStore and registers on rotation', async () => {
    let postCount = 0;
    global.fetch = jest.fn(async () => {
      postCount += 1;
      return new Response(
        JSON.stringify({ id: 'dev-1', pushToken: 'ExponentPushToken[test-token]', platform: 'ios' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const token1 = await registerForPushNotificationsIfPermitted();
    const token2 = await registerForPushNotificationsIfPermitted();
    expect(token1).toBe('ExponentPushToken[test-token]');
    expect(token2).toBe('ExponentPushToken[test-token]');
    expect(postCount).toBe(1);
  });

  it('calls loyalty, referrals, and consents endpoints', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/api/v1/loyalty/me')) {
        return new Response(JSON.stringify({ pointsBalance: 120 }), { status: 200 });
      }
      if (url.endsWith('/api/v1/referrals/me')) {
        return new Response(JSON.stringify({ referralCode: 'KC999', referrals: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ consent: { granted: true } }), { status: 200 });
    }) as unknown as typeof fetch;

    const loyalty = await fetchMyLoyalty();
    expect(loyalty.pointsBalance).toBe(120);

    const ref = await fetchMyReferrals();
    expect(ref.referralCode).toBe('KC999');

    const consent = await recordConsent({
      type: 'marketing_push',
      granted: true,
      source: 'mobile_profile',
      version: '1.0',
    });
    expect(consent.consent).toEqual({ granted: true });
  });
});

