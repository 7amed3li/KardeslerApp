import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { Component, useEffect } from 'react';
import { Platform, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { bootstrapSession, sessionTokenStore } from '../src/api/client';
import { useAuthStore } from '../src/features/auth/model/auth.store';
import { extractNotificationDeepLink } from '../src/features/notifications/notifications.service';
import { parseSafeDeepLink, type AllowedDeepLink } from '../src/lib/deep-links';
import { initSentry } from '../src/lib/sentry';
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
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#A0422E', marginBottom: 8 }}>
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
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <DeepLinkAndNotificationBridge />
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="auth/index" options={{ presentation: 'modal' }} />
              <Stack.Screen name="menu/[id]" />
              <Stack.Screen name="checkout/index" />
              <Stack.Screen name="addresses/index" />
              <Stack.Screen name="orders/[id]" />
              <Stack.Screen name="payment-return/index" />
            </Stack>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </RootErrorBoundary>
  );
}
