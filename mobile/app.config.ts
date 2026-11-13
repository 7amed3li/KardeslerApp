import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Kardeşler Cihangir',
  slug: 'kardesler-cihangir',
  owner: 'kardesler-cihangir',
  scheme: 'kardesler',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#FAF6F0',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.kardeslercihangir.app',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Teslimat bölgesi kontrolü ve adres seçimi için konum izni gereklidir.',
    },
  },
  android: {
    package: 'com.kardeslercihangir.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FAF6F0',
    },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'POST_NOTIFICATIONS',
    ],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-notifications',
      {
        color: '#C2410C',
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Teslimat bölgesi kontrolü ve adres seçimi için konum izni gereklidir.',
      },
    ],
  ],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://kardeslerapp.onrender.com',
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '8fe36c38-ddc2-4032-934e-7ff5054d0ce6',
    },
  },
});

