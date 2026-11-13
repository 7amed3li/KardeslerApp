import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatKurus } from '../../src/lib/money/format';
import { colors } from '../../src/ui/tokens/colors';

function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    return `http://${host}:4000`;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:4000';
  }
  return 'http://127.0.0.1:4000';
}

interface MenuItemDto {
  id: string;
  name: string;
  description?: string | null;
  price_kurus?: number;
  priceKurus?: number;
  is_available?: boolean;
  isAvailable?: boolean;
  category_id?: string;
  categoryId?: string;
}

interface MenuResponse {
  language: string;
  categories: { id: string; name: string }[];
  items: MenuItemDto[];
}

export default function HomeMenuScreen() {
  const apiBase = getApiBaseUrl();

  const { data, isLoading, isError, error, refetch } = useQuery<MenuResponse>({
    queryKey: ['menu', 'tr', apiBase],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/v1/menu?lang=tr`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res.json() as Promise<MenuResponse>;
    },
  });

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.light.primary} />
        <Text style={styles.muted}>Menü yükleniyor...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Bağlantı Hatası</Text>
        <Text style={styles.muted}>
          {error instanceof Error ? error.message : 'Sunucuya ulaşılamadı'} ({apiBase})
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void refetch()}>
          <Text style={styles.retryText}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const items = data?.items ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Kardeşler Cihangir</Text>
        <Text style={styles.bannerSub}>
          Canlı API bağlantısı: {apiBase} ({items.length} ürün)
        </Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.muted}>Menüde ürün bulunamadı.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const price = item.price_kurus ?? item.priceKurus ?? 0;
          const available = item.is_available ?? item.isAvailable ?? true;
          return (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemPrice}>{formatKurus(price)}</Text>
              </View>
              {item.description ? (
                <Text style={styles.itemDesc} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              {!available ? <Text style={styles.soldOut}>Tükendi</Text> : null}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.light.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  banner: {
    backgroundColor: colors.light.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.border,
  },
  bannerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.light.text,
  },
  bannerSub: {
    fontSize: 12,
    color: colors.light.textSecondary,
    marginTop: 4,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: colors.light.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  itemName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.light.text,
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.light.primary,
  },
  itemDesc: {
    fontSize: 13,
    color: colors.light.textSecondary,
    marginTop: 6,
  },
  soldOut: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: colors.light.error,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.light.error,
  },
  muted: {
    fontSize: 14,
    color: colors.light.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: colors.light.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  retryText: {
    color: colors.light.primaryText,
    fontWeight: '600',
  },
});

