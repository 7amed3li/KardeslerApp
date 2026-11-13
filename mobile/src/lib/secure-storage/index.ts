import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEYS = {
  refreshToken: 'kc_refresh_token',
  pushToken: 'kc_last_push_token',
} as const;

const isWeb = Platform.OS === 'web';

export const secureStorage = {
  async getRefreshToken(): Promise<string | null> {
    if (isWeb) return null;
    return SecureStore.getItemAsync(KEYS.refreshToken);
  },

  async setRefreshToken(token: string): Promise<void> {
    if (isWeb) return;
    await SecureStore.setItemAsync(KEYS.refreshToken, token);
  },

  async clearRefreshToken(): Promise<void> {
    if (isWeb) return;
    await SecureStore.deleteItemAsync(KEYS.refreshToken);
  },

  async getLastPushToken(): Promise<string | null> {
    if (isWeb) return null;
    return SecureStore.getItemAsync(KEYS.pushToken);
  },

  async setLastPushToken(token: string): Promise<void> {
    if (isWeb) return;
    await SecureStore.setItemAsync(KEYS.pushToken, token);
  },

  async clearLastPushToken(): Promise<void> {
    if (isWeb) return;
    await SecureStore.deleteItemAsync(KEYS.pushToken);
  },
};
