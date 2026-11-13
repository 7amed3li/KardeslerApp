import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import { Tabs, useRouter } from 'expo-router';
import { Home, Receipt, User, UtensilsCrossed } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { queryKeys } from '../../src/api/query-keys';
import { useCartStore } from '../../src/features/cart/model/cart.store';
import { fetchMenu } from '../../src/features/menu/api/menu.api';
import { useTranslations } from '../../src/i18n';
import { PersistentCartBar } from '../../src/ui/components';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

function ActiveTabBarWithCart(props: BottomTabBarProps) {
  const router = useRouter();
  const theme = useTheme();
  const { t, language } = useTranslations();
  const items = useCartStore((s) => s.items);

  const menuQuery = useQuery({
    queryKey: queryKeys.menu(language),
    queryFn: () => fetchMenu(language),
    staleTime: 60_000,
    enabled: items.length > 0,
  });

  const { itemCount, subtotalKurus } = useMemo(() => {
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    const menuItems = menuQuery.data?.items ?? [];
    const byId = new Map(menuItems.map((m) => [m.id, m]));
    let total = 0;
    for (const line of items) {
      const dish = byId.get(line.menuItemId);
      if (!dish) continue;
      const optionMap = new Map(dish.options.map((o) => [o.id, o.priceDeltaKurus]));
      const delta = line.optionIds.reduce((acc, id) => acc + (optionMap.get(id) ?? 0), 0);
      total += (dish.priceKurus + delta) * line.quantity;
    }
    return { itemCount: count, subtotalKurus: total };
  }, [items, menuQuery.data]);

  return (
    <View
      style={{
        backgroundColor: theme.colors.surfaceElevated,
        borderTopColor: theme.colors.border,
        borderTopWidth: itemCount > 0 ? 1 : 0,
      }}
    >
      <PersistentCartBar
        itemCount={itemCount}
        subtotalKurus={subtotalKurus}
        locale={language}
        ctaLabel={t.cart.goToCart}
        itemsLabel={t.cart.itemsCount.replace('{{count}}', String(itemCount))}
        onPress={() => router.push('/cart')}
      />
      <BottomTabBar {...props} />
    </View>
  );
}

export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useTranslations();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 12);

  return (
    <Tabs
      tabBar={(props) => <ActiveTabBarWithCart {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surfaceElevated,
          borderTopColor: theme.colors.border,
          height: 72 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 8,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          paddingVertical: 4,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          lineHeight: 18,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabs.home,
          tabBarLabel: t.tabs.home,
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: t.tabs.menu,
          tabBarLabel: t.tabs.menu,
          tabBarIcon: ({ color, size }) => <UtensilsCrossed color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t.tabs.orders,
          tabBarLabel: t.tabs.orders,
          tabBarIcon: ({ color, size }) => <Receipt color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t.tabs.profile,
          tabBarLabel: t.tabs.profile,
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
