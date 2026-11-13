import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { queryKeys } from '../../src/api/query-keys';
import { useAuthStore } from '../../src/features/auth/model/auth.store';
import { listMyOrders } from '../../src/features/orders/api/orders.api';
import { useTranslations } from '../../src/i18n';
import { Card, PriceText, Screen, StateView } from '../../src/ui/components';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

export default function OrdersTabScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslations();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const ordersQuery = useQuery({
    queryKey: queryKeys.orders,
    enabled: isAuthenticated,
    queryFn: listMyOrders,
  });

  if (!isAuthenticated) {
    return (
      <Screen>
        <StateView
          kind="empty"
          title={t.profile.guestTitle}
          message={t.profile.guestDesc}
          actionLabel={t.common.loginRequired}
          onAction={() => router.push('/auth')}
        />
      </Screen>
    );
  }

  if (ordersQuery.isLoading) return <StateView kind="loading" />;
  if (ordersQuery.isError) {
    return <StateView kind="error" onRetry={() => void ordersQuery.refetch()} />;
  }

  const orders = ordersQuery.data?.orders ?? [];

  return (
    <Screen>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={ordersQuery.isRefetching}
            onRefresh={() => void ordersQuery.refetch()}
          />
        }
        ListEmptyComponent={<StateView kind="empty" title={t.orders.empty} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/orders/${item.id}`)}>
            <Card style={styles.card}>
              <View style={styles.row}>
                <Text style={[styles.ordNum, { color: theme.colors.text }]}>
                  #{item.orderNumber}
                </Text>
                <PriceText kurus={item.totalKurus} />
              </View>
              <Text style={{ color: theme.colors.accent, fontWeight: '600', fontSize: 13 }}>
                {t.orders.status[item.status] ?? item.status}
              </Text>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 14, gap: 10 },
  card: { gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ordNum: { fontSize: 16, fontWeight: '700' },
});
