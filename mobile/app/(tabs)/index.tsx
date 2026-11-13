import type { SupportedLanguage } from '@kardesler/shared';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Heart, MapPin, Search } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { queryKeys } from '../../src/api/query-keys';
import { RESTAURANT_CONFIG } from '../../src/config/restaurant';
import { useCartStore } from '../../src/features/cart/model/cart.store';
import {
  checkDeliveryCoverage,
  fetchMenu,
  fetchPublicSettings,
} from '../../src/features/menu/api/menu.api';
import { filterMenuItems } from '../../src/features/menu/model/menu.model';
import { useTranslations } from '../../src/i18n';
import { formatKurus } from '../../src/lib/money/format';
import { BRAND_IMAGES, resolveDishImage } from '../../src/ui/assets/dishImages';
import { Card, PriceText, Screen, StateView } from '../../src/ui/components';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

export default function HomeMenuScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { language, setLanguage, t } = useTranslations();

  const orderType = useCartStore((s) => s.orderType);
  const setOrderType = useCartStore((s) => s.setOrderType);
  const favoriteIds = useCartStore((s) => s.favoriteIds);
  const deliveryCoords = useCartStore((s) => s.deliveryCoords);
  const setDeliveryCoords = useCartStore((s) => s.setDeliveryCoords);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [zoneStatusText, setZoneStatusText] = useState<string | null>(null);

  const menuQuery = useQuery({
    queryKey: queryKeys.menu(language),
    queryFn: () => fetchMenu(language),
  });

  const settingsQuery = useQuery({
    queryKey: queryKeys.publicSettings,
    queryFn: fetchPublicSettings,
  });

  const filteredItems = useMemo(
    () =>
      filterMenuItems({
        items: menuQuery.data?.items ?? [],
        categoryId: selectedCategoryId,
        searchQuery,
        favoritesOnly,
        favoriteIds,
      }),
    [menuQuery.data?.items, selectedCategoryId, searchQuery, favoritesOnly, favoriteIds],
  );

  const handleCheckZone = async () => {
    try {
      let coords = deliveryCoords;
      if (!coords) {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({});
          coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        } else {
          coords = {
            lat: RESTAURANT_CONFIG.defaultCoords.latitude,
            lng: RESTAURANT_CONFIG.defaultCoords.longitude,
          };
        }
        setDeliveryCoords(coords);
      }
      const res = await checkDeliveryCoverage(coords.lat, coords.lng);
      if (res.covered && res.zone) {
        setZoneStatusText(
          `${res.zone.name} • ${t.menu.minOrder}: ${formatKurus(res.zone.minOrderKurus)}`,
        );
      } else {
        setZoneStatusText(t.menu.outOfZone);
      }
    } catch {
      setZoneStatusText(t.common.errorTitle);
    }
  };

  if (menuQuery.isLoading) {
    return <StateView kind="loading" />;
  }

  if (menuQuery.isError) {
    return (
      <StateView
        kind="error"
        message={menuQuery.error instanceof Error ? menuQuery.error.message : t.common.errorTitle}
        onRetry={() => void menuQuery.refetch()}
      />
    );
  }

  const settings = settingsQuery.data;
  const categories = menuQuery.data?.categories ?? [];

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
            {settings?.address ?? RESTAURANT_CONFIG.fallbackAddress}
          </Text>
        </View>
        <View style={styles.langRow}>
          {(['tr', 'en', 'ar'] as SupportedLanguage[]).map((lang) => (
            <Pressable
              key={lang}
              onPress={() => setLanguage(lang)}
              style={[
                styles.langChip,
                {
                  backgroundColor:
                    language === lang ? theme.colors.primary : theme.colors.surfaceElevated,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: language === lang ? theme.colors.primaryText : theme.colors.text,
                }}
              >
                {lang.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {settings && !settings.isAcceptingOrders ? (
        <View style={[styles.statusBanner, { backgroundColor: theme.colors.error }]}>
          <Text style={styles.statusBannerText}>{t.common.pausedTitle}</Text>
        </View>
      ) : null}

      <View style={styles.controls}>
        <View style={styles.modeRow}>
          {(['delivery', 'pickup'] as const).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setOrderType(mode)}
              style={[
                styles.modeBtn,
                {
                  backgroundColor:
                    orderType === mode ? theme.colors.primary : theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text
                style={{
                  fontWeight: '600',
                  fontSize: 13,
                  color: orderType === mode ? theme.colors.primaryText : theme.colors.text,
                }}
              >
                {mode === 'delivery' ? t.menu.delivery : t.menu.pickup}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => void handleCheckZone()}
            style={[
              styles.zoneBtn,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <MapPin size={15} color={theme.colors.accent} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>
              {t.menu.checkZone}
            </Text>
          </Pressable>
        </View>

        {zoneStatusText ? (
          <Text style={[styles.zoneNote, { color: theme.colors.primary }]}>{zoneStatusText}</Text>
        ) : null}

        <View style={styles.searchRow}>
          <View
            style={[
              styles.searchBox,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Search size={16} color={theme.colors.textMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t.menu.searchPlaceholder}
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.searchInput, { color: theme.colors.text }]}
            />
          </View>
          <Pressable
            onPress={() => setFavoritesOnly((v) => !v)}
            style={[
              styles.favFilterBtn,
              {
                backgroundColor: favoritesOnly ? theme.colors.primary : theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Heart
              size={16}
              color={favoritesOnly ? theme.colors.primaryText : theme.colors.error}
              fill={favoritesOnly ? theme.colors.primaryText : 'transparent'}
            />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catScroll}
        >
          <Pressable
            onPress={() => setSelectedCategoryId(null)}
            style={[
              styles.catChip,
              {
                backgroundColor:
                  selectedCategoryId === null ? theme.colors.primary : theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: selectedCategoryId === null ? theme.colors.primaryText : theme.colors.text,
              }}
            >
              {t.common.all}
            </Text>
          </Pressable>
          {categories.map((cat) => {
            const active = selectedCategoryId === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setSelectedCategoryId(cat.id)}
                style={[
                  styles.catChip,
                  {
                    backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: active ? theme.colors.primaryText : theme.colors.text,
                  }}
                >
                  {cat.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<StateView kind="empty" title={t.menu.emptySearch} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/menu/${item.id}`)}>
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
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  logo: { width: 40, height: 40, borderRadius: 20 },
  heroText: { flex: 1 },
  heroTitle: { fontSize: 16, fontWeight: '700' },
  heroSub: { fontSize: 11, marginTop: 1 },
  langRow: { flexDirection: 'row', gap: 4 },
  langChip: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6 },
  statusBanner: { paddingVertical: 6, paddingHorizontal: 12 },
  statusBannerText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  controls: { paddingHorizontal: 14, paddingTop: 10, gap: 8 },
  modeRow: { flexDirection: 'row', gap: 6 },
  modeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  zoneBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  zoneNote: { fontSize: 12, fontWeight: '600' },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 13 },
  favFilterBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catScroll: { gap: 6, paddingBottom: 4 },
  catChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  list: { padding: 14, gap: 10 },
  card: { padding: 10 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  dishImg: { width: 82, height: 82, borderRadius: 10 },
  info: { flex: 1, gap: 4 },
  name: { fontSize: 15, fontWeight: '700' },
  desc: { fontSize: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  soldOut: { fontSize: 12, fontWeight: '600' },
});
