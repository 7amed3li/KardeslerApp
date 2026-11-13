import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Heart, Search, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { queryKeys } from '../../src/api/query-keys';
import { useCartStore } from '../../src/features/cart/model/cart.store';
import { fetchMenu } from '../../src/features/menu/api/menu.api';
import { filterMenuItems } from '../../src/features/menu/model/menu.model';
import { MenuItemCard } from '../../src/features/menu/ui/MenuItemCard';
import { useTranslations } from '../../src/i18n';
import { Screen, StateView } from '../../src/ui/components';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

export default function MenuScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const theme = useTheme();
  const { t, language } = useTranslations();

  const { favoriteIds, toggleFavorite, addItem } = useCartStore();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    params.categoryId ?? null,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);

  const mainScrollRef = useRef<ScrollView>(null);
  const categoryScrollRef = useRef<ScrollView>(null);
  const sectionYPositions = useRef<Record<string, number>>({});
  const pillLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const isManualScrollingRef = useRef(false);
  const manualScrollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const menuQuery = useQuery({
    queryKey: queryKeys.menu(language),
    queryFn: () => fetchMenu(language),
  });

  const categories = useMemo(() => menuQuery.data?.categories ?? [], [menuQuery.data]);

  // Filter items without restricting category so all categories remain in order
  const matchingItems = useMemo(() => {
    if (!menuQuery.data) return [];
    return filterMenuItems({
      items: menuQuery.data.items,
      categoryId: null,
      searchQuery,
      favoritesOnly,
      favoriteIds,
      availableOnly,
    });
  }, [menuQuery.data, searchQuery, favoritesOnly, favoriteIds, availableOnly]);

  // Group items by category in the exact display order
  const categorySections = useMemo(() => {
    return categories
      .map((cat) => ({
        category: cat,
        items: matchingItems.filter((i) => i.categoryId === cat.id),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [categories, matchingItems]);

  const scrollPillIntoView = (catId: string | null) => {
    const key = catId ?? 'all';
    const layout = pillLayouts.current[key];
    if (layout && categoryScrollRef.current) {
      categoryScrollRef.current.scrollTo({
        x: Math.max(0, layout.x - 30),
        animated: true,
      });
    }
  };

  const scrollToCategory = (catId: string | null) => {
    setSelectedCategoryId(catId);
    scrollPillIntoView(catId);
    isManualScrollingRef.current = true;
    if (manualScrollTimerRef.current) clearTimeout(manualScrollTimerRef.current);

    if (catId === null) {
      mainScrollRef.current?.scrollTo({ y: 0, animated: true });
    } else {
      const targetY = sectionYPositions.current[catId];
      if (targetY !== undefined) {
        mainScrollRef.current?.scrollTo({
          y: Math.max(0, targetY - 12),
          animated: true,
        });
      }
    }

    manualScrollTimerRef.current = setTimeout(() => {
      isManualScrollingRef.current = false;
    }, 700);
  };

  useEffect(() => {
    if (params.categoryId) {
      setTimeout(() => {
        scrollToCategory(params.categoryId ?? null);
      }, 350);
    }
  }, [params.categoryId]);

  const handleMainScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isManualScrollingRef.current) return;
    const scrollY = event.nativeEvent.contentOffset.y;

    if (scrollY < 60) {
      if (selectedCategoryId !== null) {
        setSelectedCategoryId(null);
        scrollPillIntoView(null);
      }
      return;
    }

    let activeCatId: string | null = null;
    for (const sec of categorySections) {
      const secY = sectionYPositions.current[sec.category.id];
      if (secY !== undefined && scrollY >= secY - 90) {
        activeCatId = sec.category.id;
      }
    }

    if (activeCatId && activeCatId !== selectedCategoryId) {
      setSelectedCategoryId(activeCatId);
      scrollPillIntoView(activeCatId);
    }
  };

  const clearFilters = () => {
    setSelectedCategoryId(null);
    setSearchQuery('');
    setFavoritesOnly(false);
    setAvailableOnly(false);
    mainScrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  if (menuQuery.isLoading) {
    return (
      <Screen edges={['top']}>
        <StateView kind="loading" title={t.common.loading} />
      </Screen>
    );
  }

  if (menuQuery.isError) {
    return (
      <Screen edges={['top']}>
        <StateView
          kind="error"
          title={t.common.errorTitle}
          actionLabel={t.common.retry}
          onAction={() => void menuQuery.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      {/* Sticky Search & Category Header */}
      <View
        style={[
          styles.stickyHeader,
          {
            backgroundColor: theme.colors.background,
            borderBottomColor: theme.colors.border,
            paddingHorizontal: theme.spacing.md,
            paddingTop: theme.spacing.sm,
            paddingBottom: theme.spacing.xs,
            gap: theme.spacing.xs,
          },
        ]}
      >
        <Text style={[theme.typography.titleLg, { color: theme.colors.text }]}>
          {t.tabs.menu}
        </Text>

        {/* Search Input */}
        <View
          style={[
            styles.searchBox,
            {
              minHeight: theme.hitTarget.min,
              backgroundColor: theme.colors.surfaceElevated,
              borderColor: theme.colors.border,
              borderRadius: theme.radii.md,
              paddingHorizontal: theme.spacing.sm,
            },
          ]}
        >
          <Search size={18} color={theme.colors.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t.menu.searchPlaceholder}
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel={t.menu.searchPlaceholder}
            style={[
              theme.typography.body,
              {
                flex: 1,
                color: theme.colors.text,
                paddingVertical: theme.spacing.xs,
              },
            ]}
          />
          {searchQuery.length > 0 ? (
            <Pressable
              onPress={() => setSearchQuery('')}
              accessibilityRole="button"
              accessibilityLabel={t.common.clearFilters}
              style={styles.clearBtn}
            >
              <X size={16} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {/* Category & Filter Pills */}
        <ScrollView
          ref={categoryScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: theme.spacing.xs, paddingVertical: 2 }}
        >
          <Pressable
            onLayout={(e) => {
              pillLayouts.current.all = {
                x: e.nativeEvent.layout.x,
                width: e.nativeEvent.layout.width,
              };
            }}
            onPress={() => scrollToCategory(null)}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedCategoryId === null }}
            style={[
              styles.pill,
              {
                minHeight: 38,
                backgroundColor:
                  selectedCategoryId === null
                    ? theme.colors.primary
                    : theme.colors.surfaceElevated,
                borderColor:
                  selectedCategoryId === null ? theme.colors.primary : theme.colors.border,
                borderRadius: theme.radii.full,
                paddingHorizontal: theme.spacing.sm,
              },
            ]}
          >
            <Text
              style={[
                theme.typography.caption,
                {
                  color:
                    selectedCategoryId === null
                      ? theme.colors.primaryText
                      : theme.colors.text,
                  fontWeight: '600',
                },
              ]}
            >
              {t.common.all}
            </Text>
          </Pressable>

          {categories.map((cat) => {
            const active = selectedCategoryId === cat.id;
            return (
              <Pressable
                key={cat.id}
                onLayout={(e) => {
                  pillLayouts.current[cat.id] = {
                    x: e.nativeEvent.layout.x,
                    width: e.nativeEvent.layout.width,
                  };
                }}
                onPress={() => scrollToCategory(cat.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.pill,
                  {
                    minHeight: 38,
                    backgroundColor: active
                      ? theme.colors.primary
                      : theme.colors.surfaceElevated,
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                    borderRadius: theme.radii.full,
                    paddingHorizontal: theme.spacing.sm,
                  },
                ]}
              >
                <Text
                  style={[
                    theme.typography.caption,
                    {
                      color: active ? theme.colors.primaryText : theme.colors.text,
                      fontWeight: '600',
                    },
                  ]}
                >
                  {cat.name}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            onPress={() => setFavoritesOnly((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ selected: favoritesOnly }}
            style={[
              styles.pill,
              {
                minHeight: 38,
                backgroundColor: favoritesOnly
                  ? theme.colors.primarySoft
                  : theme.colors.surfaceElevated,
                borderColor: favoritesOnly ? theme.colors.primary : theme.colors.border,
                borderRadius: theme.radii.full,
                paddingHorizontal: theme.spacing.sm,
                gap: 4,
              },
            ]}
          >
            <Heart
              size={13}
              color={favoritesOnly ? theme.colors.primary : theme.colors.textSecondary}
              fill={favoritesOnly ? theme.colors.primary : 'none'}
            />
            <Text
              style={[
                theme.typography.caption,
                {
                  color: favoritesOnly ? theme.colors.primary : theme.colors.text,
                  fontWeight: '600',
                },
              ]}
            >
              {t.menu.favoritesOnly}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setAvailableOnly((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ selected: availableOnly }}
            style={[
              styles.pill,
              {
                minHeight: 38,
                backgroundColor: availableOnly
                  ? theme.colors.successSoft
                  : theme.colors.surfaceElevated,
                borderColor: availableOnly ? theme.colors.success : theme.colors.border,
                borderRadius: theme.radii.full,
                paddingHorizontal: theme.spacing.sm,
              },
            ]}
          >
            <Text
              style={[
                theme.typography.caption,
                {
                  color: availableOnly ? theme.colors.success : theme.colors.text,
                  fontWeight: '600',
                },
              ]}
            >
              {t.menu.availableOnly}
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* Main Menu Sections with Scroll-Spy */}
      <ScrollView
        ref={mainScrollRef}
        onScroll={handleMainScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          padding: theme.spacing.md,
          gap: theme.spacing.md,
          paddingBottom: theme.spacing.xxl + 40,
        }}
      >
        {categorySections.length === 0 ? (
          <StateView
            kind="empty"
            title={t.menu.emptySearch}
            actionLabel={t.common.clearFilters}
            onAction={clearFilters}
          />
        ) : (
          categorySections.map((sec) => (
            <View
              key={sec.category.id}
              onLayout={(e) => {
                sectionYPositions.current[sec.category.id] = e.nativeEvent.layout.y;
              }}
              style={styles.sectionContainer}
            >
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  {sec.category.name}
                </Text>
                <Text style={[styles.sectionCount, { color: theme.colors.textMuted }]}>
                  ({sec.items.length})
                </Text>
              </View>

              <View style={{ gap: theme.spacing.sm }}>
                {sec.items.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    locale={language}
                    isFavorite={favoriteIds.includes(item.id)}
                    soldOutLabel={t.common.soldOut}
                    addLabel={t.menu.addToCart}
                    onPress={() => router.push({ pathname: '/menu/[id]', params: { id: item.id } })}
                    onQuickAdd={() =>
                      addItem({
                        menuItemId: item.id,
                        name: item.name,
                        imageUrl: item.imageUrl,
                        quantity: 1,
                        optionIds: [],
                        optionNames: [],
                      })
                    }
                    onToggleFavorite={() => toggleFavorite(item.id)}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stickyHeader: {
    borderBottomWidth: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: 8,
  },
  clearBtn: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  sectionContainer: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '500',
  },
});
