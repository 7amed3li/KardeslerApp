import type { OrderStatus } from '@kardesler/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CheckCircle2,
  Circle,
  Phone,
  RotateCcw,
  Star,
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  I18nManager,
  Platform,
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
import { fetchPublicSettings } from '../../src/features/menu/api/menu.api';
import { registerForPushNotificationsIfPermitted } from '../../src/features/notifications/notifications.service';
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
  isTerminalOrderStatus,
  type ReorderPreviewPayload,
} from '../../src/features/orders/model/orders.model';
import { useTranslations } from '../../src/i18n';
import { formatTryFromKurus } from '../../src/lib/money/format';
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  PriceText,
  Screen,
  StateView,
} from '../../src/ui/components';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

const TIMELINE_STEPS: OrderStatus[] = ['new', 'accepted', 'on_the_way', 'delivered'];

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, language } = useTranslations();
  const addItem = useCartStore((s) => s.addItem);

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reorderPreview, setReorderPreview] = useState<ReorderPreviewPayload | null>(null);
  const [pushPromptDismissed, setPushPromptDismissed] = useState(false);

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
    mutationFn: () =>
      submitOrderReview({ orderId: id!, rating, comment: comment.trim() || undefined }),
    onSuccess: () => setFeedback('✓'),
  });

  const BackIcon = I18nManager.isRTL ? ArrowRight : ArrowLeft;

  if (detailQuery.isLoading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <StateView kind="loading" title={t.common.loading} />
      </Screen>
    );
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <Screen edges={['top', 'bottom']}>
        <StateView
          kind="error"
          title={t.common.errorTitle}
          actionLabel={t.common.retry}
          onRetry={() => void detailQuery.refetch()}
        />
      </Screen>
    );
  }

  const { order, items } = detailQuery.data;
  const phone = settingsQuery.data?.phone ?? RESTAURANT_CONFIG.fallbackPhone;
  const currentStepIdx = TIMELINE_STEPS.indexOf(order.status);

  const statusText =
    order.orderType === 'pickup' && order.status === 'on_the_way'
      ? t.orders.pickupReady
      : t.orders.status[order.status];

  const handlePayNow = async () => {
    const session = await createPaymentSession(order.id);
    await WebBrowser.openBrowserAsync(session.checkoutUrl);
    await detailQuery.refetch();
  };

  const applyReorderToCart = (preview: ReorderPreviewPayload) => {
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
    setReorderPreview(null);
    router.push('/cart');
  };

  const handleReorder = async () => {
    const preview = await previewReorder(order.id);
    const hasDiff =
      (preview.unavailableItems?.length ?? 0) > 0 ||
      (preview.priceChanges?.length ?? 0) > 0;
    if (hasDiff) {
      setReorderPreview(preview);
      return;
    }
    applyReorderToCart(preview);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.xs,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t.common.back}
          style={[styles.iconBtn, { minWidth: theme.hitTarget.min, minHeight: theme.hitTarget.min }]}
        >
          <BackIcon size={20} color={theme.colors.text} />
        </Pressable>
        <Text style={[theme.typography.titleMd, { color: theme.colors.text, flex: 1 }]}>
          {t.orders.orderNumber} #{order.orderNumber}
        </Text>
        <Badge
          label={statusText}
          tone={
            order.status === 'delivered'
              ? 'success'
              : order.status === 'cancelled' || order.status === 'rejected'
                ? 'error'
                : 'primary'
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.md,
          gap: theme.spacing.md,
          paddingBottom: theme.spacing.xxl,
        }}
      >
        {/* Contextual Post-Order Push Prompt (only on active orders, native) */}
        {Platform.OS !== 'web' &&
        !isTerminalOrderStatus(order.status) &&
        !pushPromptDismissed ? (
          <Card variant="subtle" style={{ backgroundColor: theme.colors.primarySoft, gap: theme.spacing.xs }}>
            <View style={styles.inlineRow}>
              <Bell size={18} color={theme.colors.primary} />
              <Text style={[theme.typography.titleSm, { color: theme.colors.text, flex: 1 }]}>
                {t.orders.pushAfterOrderTitle}
              </Text>
            </View>
            <Text style={[theme.typography.bodySm, { color: theme.colors.textSecondary }]}>
              {t.orders.pushAfterOrderDesc}
            </Text>
            <View style={[styles.inlineRow, { gap: theme.spacing.xs }]}>
              <Button
                label={t.orders.enableNotifications}
                size="sm"
                onPress={() => {
                  void registerForPushNotificationsIfPermitted().finally(() =>
                    setPushPromptDismissed(true),
                  );
                }}
              />
              <Button
                label={t.common.close}
                size="sm"
                variant="ghost"
                onPress={() => setPushPromptDismissed(true)}
              />
            </View>
          </Card>
        ) : null}

        {/* Calm Timeline */}
        {order.status !== 'cancelled' && order.status !== 'rejected' ? (
          <Card variant="elevated" style={{ gap: theme.spacing.sm }}>
            {TIMELINE_STEPS.map((stepKey, idx) => {
              const reached = currentStepIdx >= idx;
              const label =
                order.orderType === 'pickup' && stepKey === 'on_the_way'
                  ? t.orders.pickupReady
                  : t.orders.status[stepKey];
              return (
                <View key={stepKey} style={styles.inlineRow}>
                  {reached ? (
                    <CheckCircle2 size={18} color={theme.colors.success} />
                  ) : (
                    <Circle size={18} color={theme.colors.border} />
                  )}
                  <Text
                    style={[
                      reached ? theme.typography.label : theme.typography.body,
                      {
                        color: reached ? theme.colors.text : theme.colors.textMuted,
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </Card>
        ) : null}

        {/* Items & Total */}
        <Card variant="elevated" style={{ gap: theme.spacing.xs }}>
          {items.map((item) => (
            <View key={item.id} style={styles.rowBetween}>
              <Text style={[theme.typography.body, { color: theme.colors.text, flex: 1 }]}>
                {item.quantity}× {item.nameSnapshot}
              </Text>
              <PriceText kurus={item.totalPriceKurus} locale={language} />
            </View>
          ))}
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <View style={styles.rowBetween}>
            <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
              {t.cart.total}
            </Text>
            <PriceText
              kurus={order.totalKurus}
              locale={language}
              style={{ fontSize: 17, fontWeight: '700' }}
            />
          </View>
        </Card>

        {/* Actions */}
        <View style={{ gap: theme.spacing.xs }}>
          {order.status === 'awaiting_payment' ? (
            <Button label={t.checkout.payNow} fullWidth onPress={() => void handlePayNow()} />
          ) : null}

          {canCustomerCancelOrder(order.status) ? (
            <Button
              label={t.orders.cancelOrder}
              variant="danger"
              fullWidth
              loading={cancelMutation.isPending}
              onPress={() => cancelMutation.mutate()}
            />
          ) : !isTerminalOrderStatus(order.status) ? (
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
              {t.orders.cancelUnavailable}
            </Text>
          ) : null}

          <Button
            label={t.orders.callRestaurant}
            variant="secondary"
            fullWidth
            icon={<Phone size={16} color={theme.colors.text} />}
            onPress={() => void Linking.openURL(`tel:${phone}`)}
          />

          <Button
            label={t.orders.reorder}
            variant="outline"
            fullWidth
            icon={<RotateCcw size={16} color={theme.colors.primary} />}
            onPress={() => void handleReorder()}
          />
        </View>

        {/* Review for Delivered Orders */}
        {order.status === 'delivered' ? (
          <Card variant="elevated" style={{ gap: theme.spacing.sm }}>
            <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
              {t.orders.rateOrder}
            </Text>
            <View style={[styles.inlineRow, { gap: theme.spacing.xs }]}>
              {[1, 2, 3, 4, 5].map((star) => {
                const active = star <= rating;
                return (
                  <Pressable
                    key={star}
                    onPress={() => setRating(star)}
                    accessibilityRole="button"
                    accessibilityLabel={`${star}`}
                    style={[
                      styles.starBtn,
                      {
                        minWidth: theme.hitTarget.min,
                        minHeight: theme.hitTarget.min,
                        borderColor: active ? theme.colors.accent : theme.colors.border,
                        backgroundColor: active
                          ? theme.colors.accentSoft
                          : theme.colors.surface,
                        borderRadius: theme.radii.sm,
                      },
                    ]}
                  >
                    <Star
                      size={18}
                      color={active ? theme.colors.accent : theme.colors.textMuted}
                      fill={active ? theme.colors.accent : 'none'}
                    />
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder={t.orders.reviewComment}
              placeholderTextColor={theme.colors.textMuted}
              multiline
              style={[
                theme.typography.body,
                styles.reviewInput,
                {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radii.sm,
                  padding: theme.spacing.sm,
                },
              ]}
            />
            <Button
              label={t.orders.submitReview}
              loading={reviewMutation.isPending}
              onPress={() => reviewMutation.mutate()}
            />
            {feedback ? (
              <Text style={[theme.typography.bodySm, { color: theme.colors.success }]}>
                {feedback}
              </Text>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>

      {/* Reorder Reconciliation Sheet */}
      <BottomSheet
        visible={reorderPreview !== null}
        onClose={() => setReorderPreview(null)}
        title={t.orders.reorderNoticeTitle}
        closeLabel={t.common.close}
      >
        <View style={{ gap: theme.spacing.sm }}>
          {(reorderPreview?.priceChanges?.length ?? 0) > 0 ? (
            <View style={{ gap: 4 }}>
              <Text style={[theme.typography.label, { color: theme.colors.text }]}>
                {t.orders.reorderPriceChanged}
              </Text>
              {reorderPreview?.priceChanges?.map((pc) => (
                <Text
                  key={pc.name}
                  style={[theme.typography.bodySm, { color: theme.colors.textSecondary }]}
                >
                  • {pc.name}: {formatTryFromKurus(pc.oldKurus, language)} →{' '}
                  {formatTryFromKurus(pc.newKurus, language)}
                </Text>
              ))}
            </View>
          ) : null}

          {(reorderPreview?.unavailableItems?.length ?? 0) > 0 ? (
            <View style={{ gap: 4 }}>
              <Text style={[theme.typography.label, { color: theme.colors.error }]}>
                {t.orders.reorderUnavailable}
              </Text>
              {reorderPreview?.unavailableItems?.map((u) => (
                <Text
                  key={u.menuItemId}
                  style={[theme.typography.bodySm, { color: theme.colors.textSecondary }]}
                >
                  • {u.name}
                </Text>
              ))}
            </View>
          ) : null}

          <Button
            label={t.common.confirm}
            fullWidth
            onPress={() => {
              if (reorderPreview) applyReorderToCart(reorderPreview);
            }}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    gap: 8,
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  starBtn: {
    flex: 1,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewInput: {
    borderWidth: 1,
    minHeight: 72,
    textAlignVertical: 'top',
  },
});
