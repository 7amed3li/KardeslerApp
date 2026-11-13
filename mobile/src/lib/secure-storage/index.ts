import * as SecureStore from 'expo-secure-store';

const KEYS = {
  refreshToken: 'kc_refresh_token',
  pushToken: 'kc_last_push_token',
} as const;

export const secureStorage = {
  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.refreshToken);
  },

  async setRefreshToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.refreshToken, token);
  },

  async clearRefreshToken(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.refreshToken);
  },

  async getLastPushToken(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.pushToken);
  },

  async setLastPushToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.pushToken, token);
  },

  async clearLastPushToken(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.pushToken);
  },
};

