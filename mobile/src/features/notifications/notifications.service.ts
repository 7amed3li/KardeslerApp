import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiClient, unwrapApiResponse } from '../../api/client';
import { parseSafeDeepLink, type AllowedDeepLink } from '../../lib/deep-links';
import { logger } from '../../lib/logger';
import { secureStorage } from '../../lib/secure-storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('orders', {
    name: 'Sipariş Güncellemeleri',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
  });
}

export async function registerForPushNotificationsIfPermitted(): Promise<string | null> {
  await ensureAndroidNotificationChannel();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') {
    return null;
  }

  if (!Device.isDevice && Platform.OS !== 'web') {
    logger.info('Push token skipped on simulator');
    return null;
  }

  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  const tokenRes = await Notifications.getExpoPushTokenAsync(
    projectId && projectId !== 'NEEDS_CONFIRMATION' ? { projectId } : undefined,
  );
  const pushToken = tokenRes.data;

  const lastToken = await secureStorage.getLastPushToken();
  if (lastToken !== pushToken) {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const appVersion = Constants.expoConfig?.version ?? '1.0.0';
    await unwrapApiResponse(
      apiClient.POST('/api/v1/devices', {
        body: { pushToken, platform, appVersion },
      }) as Promise<{ data?: unknown; error?: unknown; response: Response }>,
    );
    await secureStorage.setLastPushToken(pushToken);
  }

  return pushToken;
}

export function extractNotificationDeepLink(
  response: Notifications.NotificationResponse | null,
): AllowedDeepLink | null {
  if (!response) return null;
  const data = response.notification.request.content.data as
    | { url?: string; orderId?: string }
    | undefined;
  if (data?.url) {
    return parseSafeDeepLink(data.url);
  }
  if (data?.orderId) {
    return parseSafeDeepLink(`kardesler://orders/${data.orderId}`);
  }
  return null;
}
