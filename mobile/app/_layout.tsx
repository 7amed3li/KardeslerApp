import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { bootstrapSession, sessionTokenStore } from '../src/api/client';
import { useAuthStore } from '../src/features/auth/model/auth.store';
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="auth/index" options={{ presentation: 'modal' }} />
            </Stack>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
