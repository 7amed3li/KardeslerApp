import type { OrderStatus } from '@kardesler/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Receipt } from 'lucide-react-native';
import React from 'react';
import {
  FlatList,
  I18nManager,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { queryKeys } from '../../src/api/query-keys';
import { useAuthStore } from '../../src/features/auth/model/auth.store';
import { listMyOrders } from '../../src/features/orders/api/orders.api';
import { useTranslations } from '../../src/i18n';
import { Badge, type BadgeTone, Card, PriceText, Screen, StateView } from '../../src/ui/components';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

function statusBadgeTone(status: OrderStatus): BadgeTone {
  if (status === 'delivered') return 'success';
  if (status === 'cancelled' || status === 'rejected') return 'error';
  if (status === 'awaiting_payment') return 'accent';
  return 'primary';
}

export default function OrdersTabScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, language } = useTranslations();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const ordersQuery = useQuery({
    queryKey: queryKeys.orders,
    enabled: isAuthenticated,
    queryFn: listMyOrders,
  });

  const ChevronIcon = I18nManager.isRTL ? ChevronLeft : ChevronRight;

  if (!isAuthenticated) {
    return (
      <Screen edges={['top']}>
        <View style={[styles.header, { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm }]}>
          <Text style={[theme.typography.titleLg, { color: theme.colors.text }]}>
            {t.orders.title}
          </Text>
        </View>
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

  if (ordersQuery.isLoading) {
    return (
      <Screen edges={['top']}>
        <StateView kind="loading" title={t.common.loading} />
      </Screen>
    );
  }

  if (ordersQuery.isError) {
    return (
      <Screen edges={['top']}>
        <StateView
          kind="error"
          title={t.common.errorTitle}
          actionLabel={t.common.retry}
          onRetry={() => void ordersQuery.refetch()}
        />
      </Screen>
    );
  }

  const orders = ordersQuery.data?.orders ?? [];

  return (
    <Screen edges={['top']}>
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: theme.spacing.md,
            paddingTop: theme.spacing.sm,
            paddingBottom: theme.spacing.xs,
          },
        ]}
      >
        <Text style={[theme.typography.titleLg, { color: theme.colors.text }]}>
          {t.orders.title}
        </Text>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{
          padding: theme.spacing.md,
          gap: theme.spacing.sm,
          paddingBottom: theme.spacing.xxl,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={ordersQuery.isRefetching}
            onRefresh={() => void ordersQuery.refetch()}
          />
        }
        ListEmptyComponent={
          <StateView
            kind="empty"
            title={t.orders.empty}
            message={t.orders.emptyDesc}
            actionLabel={t.home.openMenu}
            onAction={() => router.push('/(tabs)/menu')}
          />
        }
        renderItem={({ item }) => {
          const statusText =
            item.orderType === 'pickup' && item.status === 'on_the_way'
              ? t.orders.pickupReady
              : t.orders.status[item.status];
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/orders/[id]', params: { id: item.id } })}
              accessibilityRole="button"
            >
              <Card variant="elevated" style={{ gap: theme.spacing.xs }}>
                <View style={styles.row}>
                  <View style={[styles.inlineRow, { flex: 1 }]}>
                    <Receipt size={16} color={theme.colors.primary} />
                    <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
                      {t.orders.orderNumber} #{item.orderNumber}
                    </Text>
                  </View>
                  <Badge label={statusText} tone={statusBadgeTone(item.status)} />
                </View>

                <View style={styles.row}>
                  <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
                    {item.orderType === 'pickup' ? t.menu.pickup : t.menu.delivery}
                    {item.createdAt
                      ? ` • ${new Date(item.createdAt).toLocaleDateString(
                          language === 'ar' ? 'ar-EG' : language === 'en' ? 'en-US' : 'tr-TR',
                        )}`
                      : ''}
                  </Text>
                  <View style={styles.inlineRow}>
                    <PriceText kurus={item.totalKurus} locale={language} />
                    <ChevronIcon size={16} color={theme.colors.textMuted} />
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
