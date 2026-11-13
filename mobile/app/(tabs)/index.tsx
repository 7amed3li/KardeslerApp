import type { SupportedLanguage } from '@kardesler/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react-native';
import React, { useMemo } from 'react';
import {
  I18nManager,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { queryKeys } from '../../src/api/query-keys';
import type { MenuItemDto } from '../../src/api/types';
import { useAuthStore } from '../../src/features/auth/model/auth.store';
import { useCartStore } from '../../src/features/cart/model/cart.store';
import {
  fetchBanners,
  fetchMenu,
  fetchPublicSettings,
} from '../../src/features/menu/api/menu.api';
import { listMyOrders } from '../../src/features/orders/api/orders.api';
import { useTranslations } from '../../src/i18n';
import {
  BRAND_IMAGES,
  resolveDishImage,
  resolveOptionalDishImage,
} from '../../src/ui/assets/dishImages';
import {
  Badge,
  Button,
  Card,
  PriceText,
  Screen,
  SkeletonBox,
  StateView,
  StoriesShowcase,
  type StoryHighlight,
} from '../../src/ui/components';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

const LANGS: { code: SupportedLanguage; label: string }[] = [
  { code: 'tr', label: 'TR' },
  { code: 'en', label: 'EN' },
  { code: 'ar', label: 'AR' },
];

export default function HomeTabScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { language, setLanguage, t } = useTranslations();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const addItem = useCartStore((s) => s.addItem);
  const deliveryAddressText = useCartStore((s) => s.deliveryAddressText);

  const settingsQuery = useQuery({
    queryKey: queryKeys.publicSettings,
    queryFn: fetchPublicSettings,
    staleTime: 60_000,
  });

  const menuQuery = useQuery({
    queryKey: queryKeys.menu(language),
    queryFn: () => fetchMenu(language),
  });

  const bannersQuery = useQuery({
    queryKey: queryKeys.banners,
    queryFn: fetchBanners,
    staleTime: 120_000,
  });

  const ordersQuery = useQuery({
    queryKey: queryKeys.orders,
    queryFn: listMyOrders,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const allItems = useMemo(() => menuQuery.data?.items ?? [], [menuQuery.data]);
  const featuredItems = useMemo(
    () => allItems.filter((i) => i.isAvailable).slice(0, 8),
    [allItems],
  );
  const categories = useMemo(() => menuQuery.data?.categories ?? [], [menuQuery.data]);
  const activeBanner = bannersQuery.data?.banners?.[0] ?? null;
  const recentOrder = ordersQuery.data?.orders?.[0] ?? null;

  const categoryCards = useMemo(() => {
    return categories.map((cat) => {
      const catItemWithImg = allItems.find((i) => i.categoryId === cat.id && i.imageUrl);
      const image = catItemWithImg
        ? resolveDishImage(catItemWithImg.name, catItemWithImg.imageUrl)
        : BRAND_IMAGES.heroBg;
      return { ...cat, image };
    });
  }, [allItems, categories]);

  const stories: StoryHighlight[] = useMemo(
    () => [
      {
        id: 'wood-fire',
        title: t.home.storyWoodFire,
        subtitle: t.home.storyWoodFireSub,
        image: resolveDishImage('Adana Kebap', '/images/adana.webp'),
        categoryKeyword: 'kebap',
      },
      {
        id: 'breakfast',
        title: t.home.storyBreakfast,
        subtitle: t.home.storyBreakfastSub,
        image: resolveDishImage('Serpme Kahvaltı', '/images/Serpme-Kahvalti-2-Kisilik.webp'),
        categoryKeyword: 'kahvalt',
      },
      {
        id: 'stone-oven',
        title: t.home.storyStoneOven,
        subtitle: t.home.storyStoneOvenSub,
        image: resolveDishImage('Lahmacun', '/images/lahmacun.webp'),
        categoryKeyword: 'lahmacun',
      },
      {
        id: 'dessert',
        title: t.home.storyDessert,
        subtitle: t.home.storyDessertSub,
        image: resolveDishImage('Trileçe', '/images/trilece.webp'),
        categoryKeyword: 'tatl',
      },
      {
        id: 'daily-special',
        title: t.home.featured,
        subtitle: t.home.craftSub,
        image: resolveDishImage('Karışık Kebap', '/images/27-Karisik-Kebap_1.webp'),
      },
    ],
    [t],
  );

  const settings = settingsQuery.data;
  const statusTone = !settings
    ? 'neutral'
    : settings.orderingAvailable
      ? 'success'
      : settings.isAcceptingOrders
        ? 'accent'
        : 'error';
  const statusLabel = !settings
    ? t.common.loading
    : settings.orderingAvailable
      ? t.common.open
      : settings.isAcceptingOrders
        ? t.common.paused
        : t.common.closed;

  const handleLocationPress = () => {
    router.push('/addresses');
  };

  const handleQuickAdd = (item: MenuItemDto) => {
    const hasRequired = item.options.some((o) => o.isRequired);
    if (hasRequired) {
      router.push({ pathname: '/menu/[id]', params: { id: item.id } });
      return;
    }
    addItem({
      menuItemId: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      quantity: 1,
      optionIds: [],
      optionNames: [],
    });
  };

  const ArrowIcon = I18nManager.isRTL ? ChevronLeft : ChevronRight;

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.xxl,
          gap: theme.spacing.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header: Circular Logo + Restaurant Name + Location Pill + Bell/Language */}
        <View style={styles.topHeader}>
          <View style={styles.brandRow}>
            <Image source={BRAND_IMAGES.logo} style={styles.logo} resizeMode="cover" />
            <View style={{ gap: 4 }}>
              <Text style={[theme.typography.titleMd, { color: theme.colors.text }]}>
                {t.appName}
              </Text>
              <Pressable
                onPress={handleLocationPress}
                accessibilityRole="button"
                style={[
                  styles.locationPill,
                  {
                    backgroundColor: theme.colors.surfaceElevated,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radii.full,
                  },
                ]}
              >
                <MapPin size={13} color={theme.colors.primary} />
                <Text
                  style={[theme.typography.caption, { color: theme.colors.text, fontWeight: '600' }]}
                  numberOfLines={1}
                >
                  {deliveryAddressText ?? 'Beyoğlu, İstanbul'}
                </Text>
                <ChevronDown size={13} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              onPress={() => router.push('/(tabs)/orders')}
              accessibilityRole="button"
              accessibilityLabel={t.tabs.orders}
              style={[
                styles.bellBtn,
                {
                  backgroundColor: theme.colors.surfaceElevated,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Bell size={18} color={theme.colors.text} />
            </Pressable>
          </View>
        </View>

        {/* Compact Status & Language Row */}
        <View style={styles.metaBar}>
          <Badge label={statusLabel} tone={statusTone} />
          <View
            style={[
              styles.langGroup,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radii.full,
              },
            ]}
          >
            {LANGS.map((l) => {
              const active = l.code === language;
              return (
                <Pressable
                  key={l.code}
                  onPress={() => void setLanguage(l.code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.langPill,
                    {
                      backgroundColor: active ? theme.colors.primary : 'transparent',
                      borderRadius: theme.radii.full,
                    },
                  ]}
                >
                  <Text
                    style={[
                      theme.typography.caption,
                      {
                        color: active ? theme.colors.primaryText : theme.colors.textSecondary,
                        fontWeight: '700',
                      },
                    ]}
                  >
                    {l.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Pill Search Bar -> Opens Dedicated Menu Tab */}
        <Pressable
          onPress={() => router.push('/(tabs)/menu')}
          accessibilityRole="search"
          accessibilityLabel={t.menu.searchPlaceholder}
          style={({ pressed }) => [
            styles.searchPill,
            {
              backgroundColor: pressed ? theme.colors.surface : theme.colors.surfaceElevated,
              borderColor: theme.colors.border,
              borderRadius: theme.radii.full,
            },
          ]}
        >
          <Search size={18} color={theme.colors.textMuted} />
          <Text
            style={[theme.typography.bodySm, { color: theme.colors.textMuted, flex: 1 }]}
            numberOfLines={1}
          >
            {t.menu.searchPlaceholder}
          </Text>
        </Pressable>

        {/* Story Highlights Strip */}
        <StoriesShowcase
          sectionTitle=""
          stories={stories}
          ctaLabel={t.home.seeInMenu}
          closeLabel={t.home.closeStory}
          onSelectStoryCta={(story) => {
            const matched = story.categoryKeyword
              ? categories.find((c) =>
                  c.name.toLocaleLowerCase('tr-TR').includes(story.categoryKeyword!),
                )
              : undefined;
            if (matched) {
              router.push({ pathname: '/(tabs)/menu', params: { categoryId: matched.id } });
            } else {
              router.push('/(tabs)/menu');
            }
          }}
        />

        {/* Hero Offer / Campaign Banner ("Bugün Kardeşler'de") */}
        <View style={{ gap: theme.spacing.xs }}>
          <View style={styles.sectionHeader}>
            <Text style={[theme.typography.titleMd, { color: theme.colors.text }]}>
              {t.home.campaignLabel}
            </Text>
            <Pressable
              onPress={() => router.push('/(tabs)/menu')}
              style={styles.seeAllRow}
            >
              <Text style={[theme.typography.label, { color: theme.colors.primary }]}>
                {t.common.all}
              </Text>
              <ArrowIcon size={15} color={theme.colors.primary} />
            </Pressable>
          </View>

          <Pressable
            onPress={() => router.push('/(tabs)/menu')}
            accessibilityRole="button"
            style={[
              styles.heroCard,
              {
                borderRadius: theme.radii.lg,
                backgroundColor: theme.colors.primary,
              },
            ]}
          >
            <Image source={BRAND_IMAGES.heroBg} style={styles.heroImage} resizeMode="cover" />
            <View style={styles.heroScrim}>
              <Text style={[theme.typography.titleLg, { color: '#FFFFFF' }]}>
                {activeBanner?.titleTranslations?.[language] ??
                  activeBanner?.titleTranslations?.tr ??
                  t.home.campaignFallbackTitle}
              </Text>
              <Text style={[theme.typography.bodySm, { color: 'rgba(255,255,255,0.9)' }]}>
                {t.home.campaignFallbackSub}
              </Text>
              <View style={styles.heroPill}>
                <Text style={[theme.typography.label, { color: theme.colors.primary }]}>
                  {t.home.openMenu}
                </Text>
              </View>
            </View>
          </Pressable>
        </View>

        {/* Categories Horizontal Photo Cards */}
        {categoryCards.length > 0 ? (
          <View style={{ gap: theme.spacing.xs }}>
            <View style={styles.sectionHeader}>
              <Text style={[theme.typography.titleMd, { color: theme.colors.text }]}>
                {t.home.categories}
              </Text>
              <Pressable
                onPress={() => router.push('/(tabs)/menu')}
                style={styles.seeAllRow}
              >
                <Text style={[theme.typography.label, { color: theme.colors.primary }]}>
                  {t.common.all}
                </Text>
                <ArrowIcon size={15} color={theme.colors.primary} />
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: theme.spacing.xs }}
            >
              {categoryCards.map((cat) => (
                <Pressable
                  key={cat.id}
                  onPress={() =>
                    router.push({ pathname: '/(tabs)/menu', params: { categoryId: cat.id } })
                  }
                  accessibilityRole="button"
                  style={[
                    styles.catPhotoCard,
                    {
                      borderRadius: theme.radii.md,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceElevated,
                    },
                  ]}
                >
                  <Image source={cat.image} style={styles.catPhoto} resizeMode="cover" />
                  <View
                    style={[
                      styles.catLabelBar,
                      { backgroundColor: theme.colors.primary },
                    ]}
                  >
                    <Text
                      style={[theme.typography.caption, { color: '#FFFFFF', fontWeight: '700' }]}
                      numberOfLines={1}
                    >
                      {cat.name}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Quick Reorder for Returning Users */}
        {recentOrder ? (
          <Card variant="elevated" style={{ gap: theme.spacing.xs }}>
            <View style={styles.sectionHeader}>
              <View style={styles.inlineMeta}>
                <RotateCcw size={16} color={theme.colors.primary} />
                <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
                  {t.home.reorderTitle}
                </Text>
              </View>
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                #{recentOrder.orderNumber}
              </Text>
            </View>
            <Button
              label={t.home.reorderAgain}
              variant="outline"
              size="sm"
              onPress={() =>
                router.push({ pathname: '/orders/[id]', params: { id: recentOrder.id } })
              }
            />
          </Card>
        ) : null}

        {/* Featured / Best Sellers Horizontal Dish Cards */}
        <View style={{ gap: theme.spacing.xs }}>
          <View style={styles.sectionHeader}>
            <Text style={[theme.typography.titleMd, { color: theme.colors.text }]}>
              {t.home.featured}
            </Text>
            <Pressable
              onPress={() => router.push('/(tabs)/menu')}
              style={styles.seeAllRow}
            >
              <Text style={[theme.typography.label, { color: theme.colors.primary }]}>
                {t.common.all}
              </Text>
              <ArrowIcon size={15} color={theme.colors.primary} />
            </Pressable>
          </View>

          {menuQuery.isLoading ? (
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <SkeletonBox height={180} width={150} borderRadius={16} />
              <SkeletonBox height={180} width={150} borderRadius={16} />
            </View>
          ) : menuQuery.isError ? (
            <StateView
              kind="error"
              title={t.common.errorTitle}
              actionLabel={t.common.retry}
              onAction={() => void menuQuery.refetch()}
            />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: theme.spacing.sm }}
            >
              {featuredItems.map((item) => {
                const img = resolveOptionalDishImage(item.name, item.imageUrl) ?? BRAND_IMAGES.heroBg;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => router.push({ pathname: '/menu/[id]', params: { id: item.id } })}
                    style={[
                      styles.dishCard,
                      {
                        backgroundColor: theme.colors.surfaceElevated,
                        borderColor: theme.colors.border,
                        borderRadius: theme.radii.md,
                      },
                    ]}
                  >
                    <Image source={img} style={styles.dishPhoto} resizeMode="cover" />
                    <View style={styles.dishBody}>
                      <Text
                        style={[theme.typography.label, { color: theme.colors.text }]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      <View style={styles.dishFooter}>
                        <PriceText
                          kurus={item.priceKurus}
                          locale={language}
                          style={[
                            theme.typography.label,
                            { color: theme.colors.primary, fontWeight: '700' },
                          ]}
                        />
                        <Pressable
                          onPress={() => handleQuickAdd(item)}
                          accessibilityRole="button"
                          accessibilityLabel={t.menu.addToCart}
                          style={[
                            styles.quickAddBtn,
                            { backgroundColor: theme.colors.primary },
                          ]}
                        >
                          <Plus size={16} color="#FFFFFF" />
                        </Pressable>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
    maxWidth: 200,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  langGroup: {
    flexDirection: 'row',
    borderWidth: 1,
    padding: 2,
    gap: 2,
  },
  langPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 32,
    alignItems: 'center',
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 44,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  inlineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroCard: {
    overflow: 'hidden',
    minHeight: 164,
    justifyContent: 'center',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroScrim: {
    padding: 16,
    gap: 8,
    backgroundColor: 'rgba(107, 21, 29, 0.72)',
    minHeight: 164,
    justifyContent: 'center',
  },
  heroPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#F5EFE3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 4,
  },
  catPhotoCard: {
    width: 96,
    height: 112,
    overflow: 'hidden',
    borderWidth: 1,
  },
  catPhoto: {
    width: '100%',
    height: 82,
  },
  catLabelBar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  dishCard: {
    width: 154,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dishPhoto: {
    width: '100%',
    height: 104,
  },
  dishBody: {
    padding: 10,
    gap: 8,
  },
  dishFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quickAddBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
