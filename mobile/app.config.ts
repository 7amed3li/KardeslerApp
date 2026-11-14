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
    googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '717773080616-v8cu51sbfc5e1qdsh6ooe8nfnj9s0arg.apps.googleusercontent.com',
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '717773080616-8n5u4e1at0aecotdvkknfiree5lcm5ct.apps.googleusercontent.com',
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '717773080616-cukeglj0gd30f412qtefglr225rhgibi.apps.googleusercontent.com',
    googleRedirectUri: process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI ?? 'kardesler://auth/google',
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '8fe36c38-ddc2-4032-934e-7ff5054d0ce6',
    },
  },
});

