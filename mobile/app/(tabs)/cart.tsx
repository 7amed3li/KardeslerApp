import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RESTAURANT_CONFIG } from '../../src/config/restaurant';
import { useAuthStore } from '../../src/features/auth/model/auth.store';
import { quoteCart } from '../../src/features/cart/api/cart.api';
import { useCartStore } from '../../src/features/cart/model/cart.store';
import { useTranslations } from '../../src/i18n';
import { formatKurus } from '../../src/lib/money/format';
import { resolveDishImage } from '../../src/ui/assets/dishImages';
import { Button, Card, PriceText, Screen, StateView } from '../../src/ui/components';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

export default function CartTabScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslations();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const items = useCartStore((s) => s.items);
  const lastRemoved = useCartStore((s) => s.lastRemoved);
  const orderType = useCartStore((s) => s.orderType);
  const couponCode = useCartStore((s) => s.couponCode);
  const deliveryCoords = useCartStore((s) => s.deliveryCoords);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const undoRemove = useCartStore((s) => s.undoRemove);
  const setCouponCode = useCartStore((s) => s.setCouponCode);

  const [couponInput, setCouponInput] = useState(couponCode ?? '');

  const coords =
    deliveryCoords ??
    (orderType === 'delivery'
      ? {
          lat: RESTAURANT_CONFIG.defaultCoords.latitude,
          lng: RESTAURANT_CONFIG.defaultCoords.longitude,
        }
      : undefined);

  const quoteQuery = useQuery({
    queryKey: ['quote', items, orderType, couponCode, coords],
    enabled: items.length > 0,
    queryFn: () =>
      quoteCart({
        items,
        orderType,
        couponCode,
        lat: coords?.lat,
        lng: coords?.lng,
      }),
  });

  const applyCoupon = () => {
    const trimmed = couponInput.trim().toUpperCase();
    if (!trimmed) return;
    if (couponCode && couponCode !== trimmed) {
      if (Platform.OS === 'web') {
        setCouponCode(trimmed);
        return;
      }
      Alert.alert(t.cart.replaceCouponTitle, t.cart.replaceCouponBody, [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.common.confirm, onPress: () => setCouponCode(trimmed) },
      ]);
      return;
    }
    setCouponCode(trimmed);
  };

  if (items.length === 0) {
    return (
      <Screen>
        {lastRemoved ? (
          <View style={[styles.undoBar, { backgroundColor: theme.colors.surfaceElevated }]}>
            <Text style={{ color: theme.colors.text, fontSize: 13 }}>{t.cart.removedUndo}</Text>
            <Button title={t.cart.undo} variant="secondary" onPress={undoRemove} />
          </View>
        ) : null}
        <StateView
          kind="empty"
          title={t.cart.empty}
          message={t.cart.emptyDesc}
          actionLabel={t.cart.browseMenu}
          onAction={() => router.replace('/(tabs)')}
        />
      </Screen>
    );
  }

  const quote = quoteQuery.data;

  return (
    <Screen>
      {lastRemoved ? (
        <View style={[styles.undoBar, { backgroundColor: theme.colors.surfaceElevated }]}>
          <Text style={{ color: theme.colors.text, fontSize: 13 }}>{t.cart.removedUndo}</Text>
          <Button title={t.cart.undo} variant="secondary" onPress={undoRemove} />
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.lineKey}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card style={styles.lineCard}>
            <View style={styles.lineRow}>
              <Image
                source={resolveDishImage(item.name, item.imageUrl)}
                style={styles.thumb}
                resizeMode="cover"
              />
              <View style={styles.lineInfo}>
                <Text style={[styles.lineName, { color: theme.colors.text }]}>{item.name}</Text>
                {item.optionNames.length > 0 ? (
                  <Text style={[styles.lineMeta, { color: theme.colors.textSecondary }]}>
                    {item.optionNames.join(', ')}
                  </Text>
                ) : null}
                {item.note ? (
                  <Text style={[styles.lineMeta, { color: theme.colors.accent }]}>
                    {item.note}
                  </Text>
                ) : null}
              </View>
              <View style={styles.qtyGroup}>
                <Button
                  title="-"
                  variant="secondary"
                  style={styles.smallBtn}
                  onPress={() => updateQuantity(item.lineKey, -1)}
                />
                <Text style={[styles.qtyNum, { color: theme.colors.text }]}>{item.quantity}</Text>
                <Button
                  title="+"
                  variant="secondary"
                  style={styles.smallBtn}
                  onPress={() => updateQuantity(item.lineKey, 1)}
                />
              </View>
            </View>
          </Card>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Card style={styles.couponCard}>
              <View style={styles.couponRow}>
                <TextInput
                  value={couponInput}
                  onChangeText={setCouponInput}
                  placeholder={t.cart.couponPlaceholder}
                  placeholderTextColor={theme.colors.textMuted}
                  autoCapitalize="characters"
                  style={[
                    styles.couponInput,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceElevated,
                      color: theme.colors.text,
                    },
                  ]}
                />
                {couponCode ? (
                  <Button
                    title={t.cart.removeCoupon}
                    variant="outline"
                    onPress={() => {
                      setCouponCode(null);
                      setCouponInput('');
                    }}
                  />
                ) : (
                  <Button title={t.cart.applyCoupon} onPress={applyCoupon} />
                )}
              </View>
            </Card>

            {quote ? (
              <Card style={styles.summaryCard}>
                <SummaryRow label={t.cart.subtotal} kurus={quote.subtotal_kurus} />
                {quote.discount_kurus > 0 ? (
                  <SummaryRow label={t.cart.discount} kurus={-quote.discount_kurus} />
                ) : null}
                <SummaryRow label={t.cart.deliveryFee} kurus={quote.delivery_fee_kurus} />
                <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
                <View style={styles.summaryRow}>
                  <Text style={[styles.totalLabel, { color: theme.colors.text }]}>
                    {t.cart.total}
                  </Text>
                  <PriceText kurus={quote.total_kurus} style={styles.totalVal} />
                </View>
                {!quote.is_min_order_met ? (
                  <Text style={[styles.shortfall, { color: theme.colors.error }]}>
                    {t.cart.minOrderShortfall} {formatKurus(quote.min_order_shortfall_kurus)}
                  </Text>
                ) : null}
              </Card>
            ) : null}

            <Button
              title={isAuthenticated ? t.cart.checkout : t.common.loginRequired}
              disabled={quote ? !quote.is_min_order_met : quoteQuery.isLoading}
              loading={quoteQuery.isLoading}
              onPress={() => {
                if (!isAuthenticated) {
                  router.push('/auth');
                } else {
                  router.push('/checkout');
                }
              }}
            />
          </View>
        }
      />
    </Screen>
  );
}

function SummaryRow({ label, kurus }: { label: string; kurus: number }) {
  const theme = useTheme();
  return (
    <View style={styles.summaryRow}>
      <Text style={{ color: theme.colors.textSecondary, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600' }}>
        {formatKurus(kurus)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  undoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  list: { padding: 14, gap: 10 },
  lineCard: { padding: 10 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 56, height: 56, borderRadius: 8 },
  lineInfo: { flex: 1, gap: 2 },
  lineName: { fontSize: 14, fontWeight: '700' },
  lineMeta: { fontSize: 12 },
  qtyGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  smallBtn: { minHeight: 34, paddingHorizontal: 10, paddingVertical: 4 },
  qtyNum: { fontSize: 15, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  footer: { gap: 12, marginTop: 6 },
  couponCard: { padding: 10 },
  couponRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  couponInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  summaryCard: { gap: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  divider: { height: 1, marginVertical: 4 },
  totalLabel: { fontSize: 16, fontWeight: '700' },
  totalVal: { fontSize: 17 },
  shortfall: { fontSize: 12, fontWeight: '600', marginTop: 4 },
});
