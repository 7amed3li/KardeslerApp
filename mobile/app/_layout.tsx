import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { Component, useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { bootstrapSession, sessionTokenStore } from '../src/api/client';
import { queryKeys } from '../src/api/query-keys';
import { useAuthStore } from '../src/features/auth/model/auth.store';
import { fetchPublicSettings } from '../src/features/menu/api/menu.api';
import { extractNotificationDeepLink } from '../src/features/notifications/notifications.service';
import { useTranslations } from '../src/i18n';
import { parseSafeDeepLink, type AllowedDeepLink } from '../src/lib/deep-links';
import { requestStartupPermissions } from '../src/lib/permissions/startup-permissions';
import { initSentry } from '../src/lib/sentry';
import { isVersionOutdated } from '../src/lib/version';
import { OfflineBanner, Screen, StateView } from '../src/ui/components';
import { ThemeProvider } from '../src/ui/themes/ThemeProvider';

initSentry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function DeepLinkAndNotificationBridge() {
  const router = useRouter();

  useEffect(() => {
    const navigateSafe = (target: AllowedDeepLink | null) => {
      if (!target) return;
      if (target.route === '/orders/[id]') {
        router.push({ pathname: '/orders/[id]', params: target.params });
      } else if (target.route === '/payment-return') {
        router.push({ pathname: '/payment-return', params: target.params });
      } else {
        router.push(target.route);
      }
    };

    const subUrl = Linking.addEventListener('url', ({ url }) => {
      navigateSafe(parseSafeDeepLink(url));
    });

    void Linking.getInitialURL().then((url) => {
      navigateSafe(parseSafeDeepLink(url));
    });

    const subNotif =
      Platform.OS !== 'web'
        ? Notifications.addNotificationResponseReceivedListener((response) => {
            navigateSafe(extractNotificationDeepLink(response));
          })
        : { remove: () => undefined };

    if (Platform.OS !== 'web') {
      void Notifications.getLastNotificationResponseAsync().then((response) => {
        navigateSafe(extractNotificationDeepLink(response));
      });
    }

    return () => {
      subUrl.remove();
      subNotif.remove();
    };
  }, [router]);

  return null;
}

function AppShell() {
  const { t } = useTranslations();
  const [isOffline, setIsOffline] = useState(false);

  const settingsQuery = useQuery({
    queryKey: queryKeys.publicSettings,
    queryFn: fetchPublicSettings,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      setIsOffline(!window.navigator.onLine);
      const onOnline = () => setIsOffline(false);
      const onOffline = () => setIsOffline(true);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      return () => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      };
    }

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(state.isConnected === false);
    });
    return () => unsubscribe();
  }, []);

  const currentVersion = Constants.expoConfig?.version ?? '1.0.0';
  const minVersion = settingsQuery.data?.minAppVersion;
  if (isVersionOutdated(currentVersion, minVersion)) {
    return (
      <Screen edges={['top', 'bottom']}>
        <StateView
          kind="update"
          title={t.common.updateRequiredTitle}
          message={t.common.updateRequiredDesc}
        />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {isOffline ? <OfflineBanner message={t.common.offlineBanner} /> : null}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth/index" options={{ presentation: 'modal' }} />
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="offers/index" />
        <Stack.Screen name="menu/[id]" />
        <Stack.Screen name="cart" />
        <Stack.Screen name="checkout/index" />
        <Stack.Screen name="addresses/index" />
        <Stack.Screen name="orders/[id]" />
        <Stack.Screen name="payment-return/index" />
      </Stack>
    </View>
  );
}

class RootErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#EDE3CE' }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#7E2726', marginBottom: 8 }}>
            Uygulama Hatası
          </Text>
          <Text style={{ fontSize: 13, color: '#2B2620' }}>{this.state.error.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  useEffect(() => {
    void requestStartupPermissions();
    sessionTokenStore.onSessionExpired(() => {
      useAuthStore.getState().clearAuth();
    });
    void bootstrapSession().then((ok) => {
      if (ok && !useAuthStore.getState().isAuthenticated) {
        useAuthStore.getState().setAuthenticated(null);
      }
    });
  }, []);

  return (
    <RootErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <ThemeProvider>
            <QueryClientProvider client={queryClient}>
              <DeepLinkAndNotificationBridge />
              <StatusBar style="dark" />
              <AppShell />
            </QueryClientProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </RootErrorBoundary>
  );
}
