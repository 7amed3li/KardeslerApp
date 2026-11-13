import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { queryKeys } from '../../src/api/query-keys';
import { RESTAURANT_CONFIG } from '../../src/config/restaurant';
import { useCartStore } from '../../src/features/cart/model/cart.store';
import { fetchPublicSettings } from '../../src/features/menu/api/menu.api';
import {
  cancelMyOrder,
  createPaymentSession,
  getMyOrderDetail,
  previewReorder,
  submitOrderReview,
} from '../../src/features/orders/api/orders.api';
import {
  canCustomerCancelOrder,
  getOrderPollingIntervalMs,
} from '../../src/features/orders/model/orders.model';
import { useTranslations } from '../../src/i18n';
import { Button, Card, PriceText, Screen, StateView } from '../../src/ui/components';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslations();
  const addItem = useCartStore((s) => s.addItem);

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: queryKeys.publicSettings,
    queryFn: fetchPublicSettings,
  });

  const detailQuery = useQuery({
    queryKey: queryKeys.orderDetail(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => getMyOrderDetail(id!),
    refetchInterval: (q) =>
      getOrderPollingIntervalMs(q.state.data?.order.status, q.state.errorUpdateCount),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelMyOrder(id!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.orderDetail(id!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.orders });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: () => submitOrderReview({ orderId: id!, rating, comment: comment.trim() || undefined }),
    onSuccess: () => setFeedback('Değerlendirmeniz için teşekkürler!'),
  });

  if (detailQuery.isLoading) return <StateView kind="loading" />;
  if (detailQuery.isError || !detailQuery.data) {
    return <StateView kind="error" onRetry={() => void detailQuery.refetch()} />;
  }

  const { order, items } = detailQuery.data;
  const phone = settingsQuery.data?.phone ?? RESTAURANT_CONFIG.fallbackPhone;

  const handlePayNow = async () => {
    const session = await createPaymentSession(order.id);
    await WebBrowser.openBrowserAsync(session.checkoutUrl);
    await detailQuery.refetch();
  };

  const handleReorder = async () => {
    const preview = await previewReorder(order.id);
    for (const avail of preview.availableItems ?? []) {
      addItem({
        menuItemId: avail.menuItemId,
        name: avail.name,
        imageUrl: null,
        quantity: avail.quantity,
        optionIds: avail.optionIds ?? [],
        optionNames: [],
      });
    }
    router.push('/(tabs)/cart');
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.card}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            Sipariş #{order.orderNumber}
          </Text>
          <Text style={{ color: theme.colors.accent, fontWeight: '700', fontSize: 15 }}>
            {t.orders.status[order.status] ?? order.status}
          </Text>
          <PriceText kurus={order.totalKurus} style={{ fontSize: 18 }} />
        </Card>

        <Card style={styles.card}>
          {items.map((line) => (
            <View key={line.id} style={styles.line}>
              <Text style={{ color: theme.colors.text, flex: 1 }}>
                {line.quantity}x {line.nameSnapshot}
              </Text>
              <PriceText kurus={line.totalPriceKurus} />
            </View>
          ))}
        </Card>

        {order.status === 'awaiting_payment' ? (
          <Button title={t.checkout.payNow} onPress={() => void handlePayNow()} />
        ) : null}

        {canCustomerCancelOrder(order.status) ? (
          <Button
            title={t.orders.cancelOrder}
            variant="danger"
            loading={cancelMutation.isPending}
            onPress={() => cancelMutation.mutate()}
          />
        ) : null}

        <Button
          title={t.orders.callRestaurant}
          variant="secondary"
          onPress={() => void Linking.openURL(`tel:${phone}`)}
        />

        <Button
          title={t.orders.reorder}
          variant="secondary"
          onPress={() => void handleReorder()}
        />

        {order.status === 'delivered' ? (
          <Card style={styles.card}>
            <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
              {t.orders.rateOrder}
            </Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Button
                  key={star}
                  title={`${star}★`}
                  variant={rating === star ? 'primary' : 'outline'}
                  style={styles.starBtn}
                  onPress={() => setRating(star)}
                />
              ))}
            </View>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder={t.orders.reviewComment}
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
            />
            <Button
              title={t.orders.submitReview}
              loading={reviewMutation.isPending}
              onPress={() => reviewMutation.mutate()}
            />
            {feedback ? (
              <Text style={{ color: theme.colors.success, fontWeight: '600' }}>{feedback}</Text>
            ) : null}
          </Card>
        ) : null}

        <Button title={t.common.back} variant="outline" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 12 },
  card: { gap: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ratingRow: { flexDirection: 'row', gap: 6 },
  starBtn: { flex: 1, minHeight: 38, paddingHorizontal: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 42, fontSize: 14 },
});

