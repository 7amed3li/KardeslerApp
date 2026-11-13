import { Tabs } from 'expo-router';
import { ShoppingBag, UtensilsCrossed, ClipboardList, User } from 'lucide-react-native';
import React from 'react';
import { useTranslations } from '../../src/i18n';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useTranslations();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerTintColor: theme.colors.text,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.appName,
          tabBarLabel: t.tabs.menu,
          tabBarIcon: ({ color, size }) => <UtensilsCrossed color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: t.cart.title,
          tabBarLabel: t.tabs.cart,
          tabBarIcon: ({ color, size }) => <ShoppingBag color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t.orders.title,
          tabBarLabel: t.tabs.orders,
          tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t.profile.title,
          tabBarLabel: t.tabs.profile,
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
