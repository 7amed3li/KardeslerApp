import { Tabs } from 'expo-router';
import React from 'react';
import { colors } from '../../src/ui/tokens/colors';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: colors.light.primary,
        tabBarInactiveTintColor: colors.light.textMuted,
        tabBarStyle: {
          backgroundColor: colors.light.surface,
          borderTopColor: colors.light.border,
        },
        headerStyle: {
          backgroundColor: colors.light.background,
        },
        headerTintColor: colors.light.text,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Kardeşler Cihangir',
          tabBarLabel: 'Menü',
        }}
      />
    </Tabs>
  );
}

