import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { exchangeGoogleCode } from '../../src/features/auth/api/auth.api';

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const completed = WebBrowser.maybeCompleteAuthSession();
    if (completed.type === 'success') {
      return;
    }

    async function handleFullRedirect() {
      if (params.error) {
        setError(params.error === 'access_denied' ? 'Giriş iptal edildi.' : 'Giriş başarısız oldu.');
        setTimeout(() => router.replace('/(tabs)'), 2000);
        return;
      }

      if (!params.code) {
        return;
      }

      let storedPkce: {
        codeVerifier: string;
        state: string;
        nonce: string;
        clientId: string;
        redirectUri: string;
      } | null = null;

      if (typeof window !== 'undefined' && window.sessionStorage) {
        try {
          const raw = sessionStorage.getItem('kc_google_pkce');
          if (raw) storedPkce = JSON.parse(raw);
        } catch {
          storedPkce = null;
        }
      }

      if (!storedPkce || storedPkce.state !== params.state) {
        setError('Oturum doğrulanamadı.');
        setTimeout(() => router.replace('/(tabs)'), 2000);
        return;
      }

      try {
        await exchangeGoogleCode({
          code: params.code,
          codeVerifier: storedPkce.codeVerifier,
          clientId: storedPkce.clientId,
          redirectUri: storedPkce.redirectUri,
          nonce: storedPkce.nonce,
        });
        if (typeof window !== 'undefined' && window.sessionStorage) {
          sessionStorage.removeItem('kc_google_pkce');
        }
        router.replace('/(tabs)');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Giriş başarısız oldu.');
        setTimeout(() => router.replace('/(tabs)'), 2500);
      }
    }

    void handleFullRedirect();
  }, [params.code, params.error, params.state, router]);

  return (
    <View style={styles.container}>
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <>
          <ActivityIndicator size="large" color="#C2410C" />
          <Text style={styles.text}>Google ile giriş tamamlanıyor...</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAF6F0',
    gap: 16,
    padding: 24,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    color: '#292524',
  },
  errorText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#DC2626',
    textAlign: 'center',
  },
});

