import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { resolveApiBaseUrl } from '../../src/api/client';
import { queryKeys } from '../../src/api/query-keys';
import type { MenuResponseDto } from '../../src/api/types';
import { useTranslations } from '../../src/i18n';
import { BRAND_IMAGES, resolveDishImage } from '../../src/ui/assets/dishImages';
import { Card, PriceText, Screen, StateView } from '../../src/ui/components';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

export default function HomeMenuScreen() {
  const theme = useTheme();
  const { language, t } = useTranslations();
  const apiBase = resolveApiBaseUrl();

  const { data, isLoading, isError, error, refetch } = useQuery<MenuResponseDto>({
    queryKey: queryKeys.menu(language),
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/v1/menu?lang=${language}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return (await res.json()) as MenuResponseDto;
    },
  });

  if (isLoading) {
    return <StateView kind="loading" />;
  }

  if (isError) {
    return (
      <StateView
        kind="error"
        message={error instanceof Error ? error.message : t.common.errorTitle}
        onRetry={() => void refetch()}
      />
    );
  }

  const items = data?.items ?? [];

  return (
    <Screen>
      <View
        style={[
          styles.hero,
          { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border },
        ]}
      >
        <Image source={BRAND_IMAGES.logo} style={styles.logo} resizeMode="contain" />
        <View style={styles.heroText}>
          <Text style={[styles.heroTitle, { color: theme.colors.text }]}>{t.appName}</Text>
          <Text style={[styles.heroSub, { color: theme.colors.textSecondary }]}>
            Cihangir, İstanbul • 1998 • {items.length} ürün
          </Text>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<StateView kind="empty" title={t.menu.emptySearch} />}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.row}>
              <Image
                source={resolveDishImage(item.name, item.imageUrl)}
                style={styles.dishImg}
                resizeMode="cover"
              />
              <View style={styles.info}>
                <Text style={[styles.name, { color: theme.colors.text }]}>{item.name}</Text>
                {item.description ? (
                  <Text
                    style={[styles.desc, { color: theme.colors.textSecondary }]}
                    numberOfLines={2}
                  >
                    {item.description}
                  </Text>
                ) : null}
                <View style={styles.priceRow}>
                  <PriceText kurus={item.priceKurus} />
                  {!item.isAvailable ? (
                    <Text style={[styles.soldOut, { color: theme.colors.error }]}>
                      {t.common.soldOut}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  heroSub: {
    fontSize: 12,
    marginTop: 2,
  },
  list: {
    padding: 16,
    gap: 10,
  },
  card: {
    padding: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  dishImg: {
    width: 84,
    height: 84,
    borderRadius: 10,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
  },
  desc: {
    fontSize: 12,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  soldOut: {
    fontSize: 12,
    fontWeight: '600',
  },
});
