import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  ArrowRight,
  Minus,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  I18nManager,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { QuoteResponseDto } from '../src/api/types';
import { quoteCart } from '../src/features/cart/api/cart.api';
import { useCartStore } from '../src/features/cart/model/cart.store';
import { useTranslations } from '../src/i18n';
import { formatTryFromKurus } from '../src/lib/money/format';
import { resolveDishImage } from '../src/ui/assets/dishImages';
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  PriceText,
  Screen,
  StateView,
} from '../src/ui/components';
import { useTheme } from '../src/ui/themes/ThemeProvider';

export default function CartScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, language } = useTranslations();

  const {
    items,
    lastRemoved,
    orderType,
    couponCode,
    deliveryCoords,
    updateQuantity,
    removeItem,
    undoRemove,
    clearCart,
    setCouponCode,
  } = useCartStore();

  const [couponInput, setCouponInput] = useState(couponCode ?? '');
  const [pendingReplaceCode, setPendingReplaceCode] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResponseDto | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const quoteMutation = useMutation({
    mutationFn: () =>
      quoteCart({
        items,
        orderType,
        couponCode: couponCode ?? undefined,
        lat: orderType === 'delivery' ? deliveryCoords?.lat : undefined,
        lng: orderType === 'delivery' ? deliveryCoords?.lng : undefined,
      }),
    onSuccess: (res) => {
      setQuote(res);
      setQuoteError(null);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : t.common.errorTitle;
      const match = msg.match(/(?:Menü öğesi bulunamadı|Menu item not found):\s*([a-f0-9-]+)/i);
      if (match && match[1]) {
        const missingId = match[1];
        useCartStore.setState((state) => ({
          items: state.items.filter((i) => i.menuItemId !== missingId),
        }));
        setQuoteError(null);
        return;
      }
      setQuoteError(msg);
    },
  });

  const { mutate: runQuote, isPending: isQuoting } = quoteMutation;

  useEffect(() => {
    if (items.length === 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    runQuote();
  }, [items, orderType, couponCode, deliveryCoords, runQuote]);

  const handleApplyCoupon = () => {
    const trimmed = couponInput.trim().toUpperCase();
    if (!trimmed) return;
    if (couponCode && couponCode !== trimmed) {
      setPendingReplaceCode(trimmed);
      return;
    }
    setCouponCode(trimmed);
  };

  const BackIcon = I18nManager.isRTL ? ArrowRight : ArrowLeft;

  const minProgress = useMemo(() => {
    if (!quote || quote.min_order_kurus_applied <= 0) return 1;
    return Math.min(1, quote.subtotal_kurus / quote.min_order_kurus_applied);
  }, [quote]);

  if (items.length === 0) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View
          style={[
            styles.header,
            {
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
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
            {t.cart.title}
          </Text>
        </View>

        {lastRemoved ? (
          <View style={{ padding: theme.spacing.md }}>
            <Card variant="subtle" style={styles.undoCard}>
              <Text style={[theme.typography.bodySm, { color: theme.colors.text, flex: 1 }]}>
                {t.cart.removedUndo}
              </Text>
              <Button
                label={t.cart.undo}
                size="sm"
                variant="outline"
                icon={<RotateCcw size={14} color={theme.colors.primary} />}
                onPress={undoRemove}
              />
            </Card>
          </View>
        ) : null}

        <StateView
          kind="empty"
          title={t.cart.empty}
          message={t.cart.emptyDesc}
          actionLabel={t.cart.browseMenu}
          onAction={() => router.replace('/(tabs)/menu')}
        />
      </Screen>
    );
  }

  const canCheckout = quote ? quote.is_min_order_met && !isQuoting : false;

  return (
    <Screen edges={['top', 'bottom']}>
      {/* Header */}
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
          {t.cart.title}
        </Text>
        <Pressable
          onPress={clearCart}
          accessibilityRole="button"
          accessibilityLabel={t.cart.clearCart}
          style={[styles.iconBtn, { minHeight: theme.hitTarget.min, paddingHorizontal: theme.spacing.xs }]}
        >
          <Text style={[theme.typography.caption, { color: theme.colors.error, fontWeight: '600' }]}>
            {t.cart.clearCart}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.md,
          gap: theme.spacing.sm,
          paddingBottom: theme.spacing.xxl,
        }}
      >
        {lastRemoved ? (
          <Card variant="subtle" style={styles.undoCard}>
            <Text style={[theme.typography.bodySm, { color: theme.colors.text, flex: 1 }]}>
              {t.cart.removedUndo}: {lastRemoved.name}
            </Text>
            <Button
              label={t.cart.undo}
              size="sm"
              variant="outline"
              icon={<RotateCcw size={14} color={theme.colors.primary} />}
              onPress={undoRemove}
            />
          </Card>
        ) : null}

        {/* Line Items */}
        {items.map((line) => (
          <Card key={line.lineKey} variant="elevated" style={{ gap: theme.spacing.xs }}>
            <View style={styles.lineRow}>
              <Image
                source={resolveDishImage(line.name, line.imageUrl)}
                style={[styles.thumb, { borderRadius: theme.radii.sm }]}
                resizeMode="cover"
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
                  {line.name}
                </Text>
                {line.optionNames.length > 0 ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
                    {line.optionNames.join(', ')}
                  </Text>
                ) : null}
                {line.note ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                    {line.note}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => removeItem(line.lineKey)}
                accessibilityRole="button"
                accessibilityLabel={t.common.delete}
                style={[styles.iconBtn, { minWidth: theme.hitTarget.min, minHeight: theme.hitTarget.min }]}
              >
                <Trash2 size={18} color={theme.colors.error} />
              </Pressable>
            </View>

            <View style={styles.stepperRow}>
              <View style={[styles.stepperGroup, { gap: theme.spacing.xs }]}>
                <Pressable
                  onPress={() => updateQuantity(line.lineKey, -1)}
                  accessibilityRole="button"
                  accessibilityLabel="-"
                  style={[
                    styles.stepperBtn,
                    {
                      minWidth: theme.hitTarget.min,
                      minHeight: theme.hitTarget.min,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radii.sm,
                    },
                  ]}
                >
                  <Minus size={16} color={theme.colors.text} />
                </Pressable>
                <Text
                  style={[
                    theme.typography.titleSm,
                    { color: theme.colors.text, minWidth: 28, textAlign: 'center' },
                  ]}
                >
                  {line.quantity}
                </Text>
                <Pressable
                  onPress={() => updateQuantity(line.lineKey, 1)}
                  accessibilityRole="button"
                  accessibilityLabel="+"
                  style={[
                    styles.stepperBtn,
                    {
                      minWidth: theme.hitTarget.min,
                      minHeight: theme.hitTarget.min,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radii.sm,
                    },
                  ]}
                >
                  <Plus size={16} color={theme.colors.text} />
                </Pressable>
              </View>
            </View>
          </Card>
        ))}

        {/* Minimum Order Progress */}
        {quote && quote.min_order_kurus_applied > 0 ? (
          <Card variant="subtle" style={{ gap: theme.spacing.xs }}>
            <View style={styles.summaryRow}>
              <Text
                style={[
                  theme.typography.caption,
                  {
                    color: quote.is_min_order_met ? theme.colors.success : theme.colors.error,
                    fontWeight: '600',
                  },
                ]}
              >
                {quote.is_min_order_met
                  ? t.cart.minOrderMet
                  : `${t.cart.minOrderShortfall} ${formatTryFromKurus(
                      quote.min_order_shortfall_kurus,
                      language,
                    )}`}
              </Text>
            </View>
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: theme.colors.border, borderRadius: theme.radii.full },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round(minProgress * 100)}%`,
                    backgroundColor: quote.is_min_order_met
                      ? theme.colors.success
                      : theme.colors.primary,
                    borderRadius: theme.radii.full,
                  },
                ]}
              />
            </View>
          </Card>
        ) : null}

        {/* Coupon Section */}
        <Card variant="elevated" style={{ gap: theme.spacing.xs }}>
          <View style={styles.inlineRow}>
            <Tag size={16} color={theme.colors.accent} />
            <Text style={[theme.typography.label, { color: theme.colors.text }]}>
              {t.cart.couponPlaceholder}
            </Text>
            {couponCode ? (
              <Badge
                label={couponCode}
                tone="success"
              />
            ) : null}
          </View>
          <View style={styles.couponRow}>
            <TextInput
              value={couponInput}
              onChangeText={setCouponInput}
              placeholder={t.cart.couponPlaceholder}
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="characters"
              style={[
                theme.typography.body,
                styles.couponInput,
                {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radii.sm,
                  minHeight: theme.hitTarget.min,
                  paddingHorizontal: theme.spacing.sm,
                },
              ]}
            />
            <Button label={t.cart.applyCoupon} size="sm" onPress={handleApplyCoupon} />
            {couponCode ? (
              <Button
                label={t.cart.removeCoupon}
                size="sm"
                variant="outline"
                onPress={() => {
                  setCouponCode(null);
                  setCouponInput('');
                }}
              />
            ) : null}
          </View>
        </Card>

        {/* Server Quote Breakdown */}
        {quoteError ? (
          <Card variant="subtle" style={{ borderColor: theme.colors.error, gap: theme.spacing.xs }}>
            <Text style={[theme.typography.bodySm, { color: theme.colors.error }]}>
              {quoteError}
            </Text>
            <Button
              title="Sepeti Temizle"
              size="sm"
              variant="outline"
              onPress={() => {
                clearCart();
                setQuoteError(null);
              }}
            />
          </Card>
        ) : null}

        {quote ? (
          <Card variant="elevated" style={{ gap: theme.spacing.xs }}>
            <SummaryRow label={t.cart.subtotal} kurus={quote.subtotal_kurus} locale={language} />
            {quote.discount_kurus > 0 ? (
              <SummaryRow
                label={t.cart.discount}
                kurus={-quote.discount_kurus}
                locale={language}
                highlight
              />
            ) : null}
            {orderType === 'delivery' ? (
              <SummaryRow
                label={t.cart.deliveryFee}
                kurus={quote.delivery_fee_kurus}
                locale={language}
                freeLabel={t.common.free}
              />
            ) : null}
            <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
            <SummaryRow label={t.cart.total} kurus={quote.total_kurus} locale={language} bold />
          </Card>
        ) : null}
      </ScrollView>

      {/* Bottom Sticky Checkout Bar */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: theme.colors.surfaceElevated,
            borderTopColor: theme.colors.border,
            padding: theme.spacing.md,
          },
        ]}
      >
        <Button
          label={
            isQuoting
              ? t.cart.quoteUpdating
              : quote
                ? `${t.cart.checkout} • ${formatTryFromKurus(quote.total_kurus, language)}`
                : t.cart.checkout
          }
          fullWidth
          disabled={!canCheckout}
          onPress={() => router.push('/checkout')}
        />
      </View>

      {/* Coupon Replacement Confirmation Sheet */}
      <BottomSheet
        visible={pendingReplaceCode !== null}
        onClose={() => setPendingReplaceCode(null)}
        title={t.cart.replaceCouponTitle}
        subtitle={t.cart.replaceCouponBody}
        closeLabel={t.common.close}
      >
        <View style={{ gap: theme.spacing.sm }}>
          <Button
            label={t.common.confirm}
            fullWidth
            onPress={() => {
              if (pendingReplaceCode) setCouponCode(pendingReplaceCode);
              setPendingReplaceCode(null);
            }}
          />
          <Button
            label={t.common.cancel}
            variant="secondary"
            fullWidth
            onPress={() => setPendingReplaceCode(null)}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}

function SummaryRow({
  label,
  kurus,
  locale,
  bold,
  highlight,
  freeLabel,
}: {
  label: string;
  kurus: number;
  locale: string;
  bold?: boolean;
  highlight?: boolean;
  freeLabel?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.summaryRow}>
      <Text
        style={[
          bold ? theme.typography.titleSm : theme.typography.body,
          { color: bold ? theme.colors.text : theme.colors.textSecondary },
        ]}
      >
        {label}
      </Text>
      {freeLabel && kurus === 0 ? (
        <Text style={[theme.typography.label, { color: theme.colors.success }]}>{freeLabel}</Text>
      ) : (
        <PriceText
          kurus={kurus}
          locale={locale}
          style={{
            fontSize: bold ? 17 : 14,
            fontWeight: bold ? '700' : '600',
            color: highlight ? theme.colors.success : theme.colors.text,
          }}
        />
      )}
    </View>
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
  undoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  thumb: {
    width: 60,
    height: 60,
  },
  stepperRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  stepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperBtn: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 6,
    width: '100%',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  couponRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  couponInput: {
    flex: 1,
    borderWidth: 1,
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footer: {
    borderTopWidth: 1,
  },
});
