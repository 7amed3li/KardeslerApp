import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useCartStore } from '../../features/cart/model/cart.store';
import { registerForPushNotificationsIfPermitted } from '../../features/notifications/notifications.service';
import { logger } from '../logger';

/**
 * Automatically prompts for Android & iOS Notifications and Location permissions
 * upon application startup, and seeds user delivery coordinates if permitted.
 */
export async function requestStartupPermissions(): Promise<{
  notificationsGranted: boolean;
  locationGranted: boolean;
}> {
  let notificationsGranted = false;
  let locationGranted = false;

  // 1. Notifications permission
  try {
    if (Platform.OS !== 'web') {
      const token = await registerForPushNotificationsIfPermitted();
      notificationsGranted = Boolean(token);
    } else if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        const res = await Notification.requestPermission();
        notificationsGranted = res === 'granted';
      } else {
        notificationsGranted = Notification.permission === 'granted';
      }
    }
  } catch (err) {
    logger.warn('Startup notification permission check encountered an issue', { error: err });
  }

  // 2. Location permission
  try {
    if (Platform.OS !== 'web') {
      const { status } = await Location.requestForegroundPermissionsAsync();
      locationGranted = status === 'granted';
      if (locationGranted) {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (pos?.coords) {
          const { latitude, longitude } = pos.coords;
          useCartStore.getState().setDeliveryCoords({ lat: latitude, lng: longitude });
          if (!useCartStore.getState().deliveryAddressText) {
            useCartStore.getState().setDeliveryAddressText('Cihangir, Beyoğlu');
          }
        }
      }
    } else if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          locationGranted = true;
          const { latitude, longitude } = pos.coords;
          useCartStore.getState().setDeliveryCoords({ lat: latitude, lng: longitude });
        },
        () => {
          locationGranted = false;
        },
        { timeout: 6000 },
      );
    }
  } catch (err) {
    logger.warn('Startup location permission check encountered an issue', { error: err });
  }

  return { notificationsGranted, locationGranted };
}

