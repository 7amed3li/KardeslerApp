import type { PaymentMethod } from '@kardesler/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { queryKeys } from '../../src/api/query-keys';
import { RESTAURANT_CONFIG } from '../../src/config/restaurant';
import { listAddresses } from '../../src/features/addresses/api/addresses.api';
import { useAuthStore } from '../../src/features/auth/model/auth.store';
import { quoteCart } from '../../src/features/cart/api/cart.api';
import { useCartStore } from '../../src/features/cart/model/cart.store';
import { fetchPublicSettings } from '../../src/features/menu/api/menu.api';
import { createOrder, getMyOrderDetail } from '../../src/features/orders/api/orders.api';
import { generateIdempotencyKey } from '../../src/features/orders/model/orders.model';
import { useTranslations } from '../../src/i18n';
import { Button, Card, PriceText, Screen, StateView } from '../../src/ui/components';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

export default function CheckoutScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslations();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const items = useCartStore((s) => s.items);
  const orderType = useCartStore((s) => s.orderType);
  const couponCode = useCartStore((s) => s.couponCode);
  const clearCart = useCartStore((s) => s.clearCart);

  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey());
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card_online');
  const [customerNote, setCustomerNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const addressesQuery = useQuery({
    queryKey: queryKeys.addresses,
    enabled: isAuthenticated && orderType === 'delivery',
    queryFn: listAddresses,
  });

  const settingsQuery = useQuery({
    queryKey: queryKeys.publicSettings,
    queryFn: fetchPublicSettings,
  });

  const selectedAddress = useMemo(() => {
    const list = addressesQuery.data?.addresses ?? [];
    return list.find((a) => a.id === selectedAddressId) ?? list[0] ?? null;
  }, [addressesQuery.data?.addresses, selectedAddressId]);

  const quoteQuery = useQuery({
    queryKey: ['checkout-quote', items, orderType, couponCode, selectedAddress?.id],
    enabled: items.length > 0,
    queryFn: () =>
      quoteCart({
        items,
        orderType,
        couponCode,
        lat: selectedAddress?.lat,
        lng: selectedAddress?.lng,
      }),
  });

  if (!isAuthenticated) {
    return (
      <StateView
        kind="empty"
        title={t.common.loginRequired}
        actionLabel={t.common.loginRequired}
        onAction={() => router.replace('/auth')}
      />
    );
  }

  if (items.length === 0) {
    return (
      <StateView
        kind="empty"
        title={t.cart.empty}
        actionLabel={t.cart.browseMenu}
        onAction={() => router.replace('/(tabs)')}
      />
    );
  }

  const quote = quoteQuery.data;
  const settings = settingsQuery.data;
  const codExceeded =
    quote !== undefined &&
    settings !== undefined &&
    quote.total_kurus > settings.codMaxAmountKurus;

  const handlePlaceOrder = async () => {
    setErrorMsg(null);
    if (orderType === 'delivery' && !selectedAddress) {
      setErrorMsg('Lütfen teslimat adresi ekleyin veya seçin.');
      return;
    }
    if (paymentMethod === 'cash_on_delivery' && codExceeded) {
      setErrorMsg(t.checkout.codLimitExceeded);
      return;
    }

    setSubmitting(true);
    try {
      const freshSettings = await fetchPublicSettings();
      if (!freshSettings.isAcceptingOrders) {
        setErrorMsg(t.common.pausedTitle);
        return;
      }

      const created = await createOrder({
        orderType,
        paymentMethod,
        idempotencyKey: idempotencyKeyRef.current,
        items: items.map((i) => ({
          menu_item_id: i.menuItemId,
          quantity: i.quantity,
          option_ids: i.optionIds,
        })),
        ...(orderType === 'delivery' && selectedAddress ? { addressId: selectedAddress.id } : {}),
        ...(couponCode ? { couponCode } : {}),
        ...(customerNote.trim() ? { customerNote: customerNote.trim() } : {}),
      });

      if (created.paymentCheckout?.checkoutUrl) {
        await WebBrowser.openBrowserAsync(created.paymentCheckout.checkoutUrl);
        // Never trust redirect URL alone — always verify order status from server
        await getMyOrderDetail(created.id);
      }

      clearCart();
      await queryClient.invalidateQueries({ queryKey: queryKeys.orders });
      router.replace(`/orders/${created.id}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t.common.errorTitle);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t.checkout.title}</Text>

        {orderType === 'delivery' ? (
          <Card style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              {t.checkout.selectAddress}
            </Text>
            {(addressesQuery.data?.addresses ?? []).map((addr) => {
              const active = selectedAddress?.id === addr.id;
              return (
                <Pressable
                  key={addr.id}
                  onPress={() => setSelectedAddressId(addr.id)}
                  style={[
                    styles.choice,
                    {
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                      backgroundColor: active ? theme.colors.surfaceElevated : 'transparent',
                    },
                  ]}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{addr.label}</Text>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                    {addr.fullAddress}
                  </Text>
                </Pressable>
              );
            })}
            <Button
              title={t.checkout.addAddress}
              variant="secondary"
              onPress={() => router.push('/addresses')}
            />
          </Card>
        ) : (
          <Card style={styles.section}>
            <Text style={{ color: theme.colors.text }}>{t.checkout.pickupNotice}</Text>
          </Card>
        )}

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t.checkout.paymentMethod}
          </Text>
          {(['card_online', 'cash_on_delivery'] as PaymentMethod[]).map((method) => {
            const active = paymentMethod === method;
            const disabled = method === 'cash_on_delivery' && codExceeded;
            return (
              <Pressable
                key={method}
                disabled={disabled}
                onPress={() => setPaymentMethod(method)}
                style={[
                  styles.choice,
                  {
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                    backgroundColor: active ? theme.colors.surfaceElevated : 'transparent',
                    opacity: disabled ? 0.45 : 1,
                  },
                ]}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '600' }}>
                  {method === 'card_online' ? t.checkout.cardOnline : t.checkout.cashOnDelivery}
                </Text>
              </Pressable>
            );
          })}
          {codExceeded ? (
            <Text style={{ color: theme.colors.error, fontSize: 12 }}>
              {t.checkout.codLimitExceeded}
            </Text>
          ) : null}
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            {t.menu.noteLabel}
          </Text>
          <TextInput
            value={customerNote}
            onChangeText={(txt) => setCustomerNote(txt.slice(0, RESTAURANT_CONFIG.noteMaxLength))}
            placeholder={t.menu.notePlaceholder}
            placeholderTextColor={theme.colors.textMuted}
            maxLength={RESTAURANT_CONFIG.noteMaxLength}
            style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
          />
        </Card>

        {quote ? (
          <Card style={styles.section}>
            <View style={styles.totalRow}>
              <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>
                {t.cart.total}
              </Text>
              <PriceText kurus={quote.total_kurus} style={{ fontSize: 18 }} />
            </View>
          </Card>
        ) : null}

        {errorMsg ? (
          <Text style={{ color: theme.colors.error, fontWeight: '600' }}>{errorMsg}</Text>
        ) : null}

        <Button
          title={t.checkout.placeOrder}
          loading={submitting}
          onPress={() => void handlePlaceOrder()}
        />
        <Button title={t.common.back} variant="outline" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  choice: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 2 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 44, fontSize: 14 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});

