import type { PaymentMethod } from '@kardesler/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCircle2,
  CreditCard,
  MapPin,
  ShieldCheck,
  Store,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { queryKeys } from '../../src/api/query-keys';
import { listAddresses } from '../../src/features/addresses/api/addresses.api';
import { updateMyProfile } from '../../src/features/auth/api/auth.api';
import { useAuthStore } from '../../src/features/auth/model/auth.store';
import { isValidTurkishMobile, normalizeTurkishPhone } from '../../src/features/auth/model/auth.validation';
import { quoteCart } from '../../src/features/cart/api/cart.api';
import { useCartStore } from '../../src/features/cart/model/cart.store';
import { fetchPublicSettings } from '../../src/features/menu/api/menu.api';
import { createOrder, getMyOrderDetail } from '../../src/features/orders/api/orders.api';
import { generateIdempotencyKey } from '../../src/features/orders/model/orders.model';
import { useTranslations } from '../../src/i18n';
import { formatTryFromKurus } from '../../src/lib/money/format';
import { Badge, Button, Card, PriceText, Screen, StateView } from '../../src/ui/components';
import { useTheme } from '../../src/ui/themes/ThemeProvider';

type CheckoutStep = 1 | 2 | 3;

export default function CheckoutScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, language } = useTranslations();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const items = useCartStore((s) => s.items);
  const orderType = useCartStore((s) => s.orderType);
  const couponCode = useCartStore((s) => s.couponCode);
  const clearCart = useCartStore((s) => s.clearCart);

  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey());
  const [step, setStep] = useState<CheckoutStep>(1);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [contactPhoneInput, setContactPhoneInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
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
        lat: orderType === 'delivery' ? selectedAddress?.lat : undefined,
        lng: orderType === 'delivery' ? selectedAddress?.lng : undefined,
      }),
  });

  useEffect(() => {
    if (!quoteQuery.error) return;
    const msg = quoteQuery.error instanceof Error ? quoteQuery.error.message : '';
    const match = msg.match(/(?:Menü öğesi bulunamadı|Menu item not found):\s*([a-f0-9-]+)/i);
    if (match && match[1]) {
      const missingId = match[1];
      useCartStore.setState((state) => ({
        items: state.items.filter((i) => i.menuItemId !== missingId),
      }));
    }
  }, [quoteQuery.error]);

  const BackIcon = I18nManager.isRTL ? ArrowRight : ArrowLeft;

  if (!isAuthenticated) {
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
          <Text style={[theme.typography.titleMd, { color: theme.colors.text }]}>
            {t.checkout.title}
          </Text>
        </View>
        <StateView
          kind="empty"
          title={t.common.loginRequired}
          message={t.auth.basketPreserved}
          actionLabel={t.common.loginRequired}
          onAction={() => router.push('/auth')}
        />
      </Screen>
    );
  }

  if (items.length === 0) {
    return (
      <Screen edges={['top', 'bottom']}>
        <StateView
          kind="empty"
          title={t.cart.empty}
          actionLabel={t.cart.browseMenu}
          onAction={() => router.replace('/(tabs)/menu')}
        />
      </Screen>
    );
  }

  const quote = quoteQuery.data;
  const settings = settingsQuery.data;
  const codExceeded =
    quote !== undefined &&
    settings !== undefined &&
    quote.total_kurus > settings.codMaxAmountKurus;

  const needsDeliveryPhone = orderType === 'delivery' && !user?.phone;
  const canProceedStep1 = orderType === 'pickup' || (selectedAddress !== null && !needsDeliveryPhone);

  const handleSaveContactPhone = async () => {
    setErrorMsg(null);
    if (!isValidTurkishMobile(contactPhoneInput)) {
      setErrorMsg(t.checkout.contactPhoneInvalid);
      return;
    }
    setSavingPhone(true);
    try {
      await updateMyProfile({ phone: normalizeTurkishPhone(contactPhoneInput) });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t.common.errorTitle);
    } finally {
      setSavingPhone(false);
    }
  };

  const handlePlaceOrder = async () => {
    setErrorMsg(null);
    if (orderType === 'delivery' && !user?.phone) {
      setErrorMsg(t.checkout.contactPhoneRequired);
      setStep(1);
      return;
    }
    if (orderType === 'delivery' && !selectedAddress) {
      setErrorMsg(t.checkout.selectAddress);
      setStep(1);
      return;
    }
    if (paymentMethod === 'cash_on_delivery' && codExceeded) {
      setErrorMsg(t.checkout.codLimitExceeded);
      setStep(2);
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
        await getMyOrderDetail(created.id);
      }

      clearCart();
      await queryClient.invalidateQueries({ queryKey: queryKeys.orders });
      router.replace({ pathname: '/orders/[id]', params: { id: created.id } });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t.common.errorTitle);
    } finally {
      setSubmitting(false);
    }
  };

  const steps: { id: CheckoutStep; label: string }[] = [
    { id: 1, label: t.checkout.step1 },
    { id: 2, label: t.checkout.step2 },
    { id: 3, label: t.checkout.step3 },
  ];

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
          onPress={() => (step > 1 ? setStep((s) => (s - 1) as CheckoutStep) : router.back())}
          accessibilityRole="button"
          accessibilityLabel={t.common.back}
          style={[styles.iconBtn, { minWidth: theme.hitTarget.min, minHeight: theme.hitTarget.min }]}
        >
          <BackIcon size={20} color={theme.colors.text} />
        </Pressable>
        <Text style={[theme.typography.titleMd, { color: theme.colors.text, flex: 1 }]}>
          {t.checkout.title}
        </Text>
      </View>

      {/* Stepped Indicator */}
      <View
        style={[
          styles.stepperRow,
          {
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.xs,
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
            gap: theme.spacing.xs,
          },
        ]}
      >
        {steps.map((s) => {
          const active = step === s.id;
          const done = step > s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => {
                if (s.id === 1 || (s.id === 2 && canProceedStep1) || (s.id === 3 && canProceedStep1)) {
                  setStep(s.id);
                }
              }}
              style={[
                styles.stepPill,
                {
                  flex: 1,
                  minHeight: 36,
                  borderRadius: theme.radii.full,
                  backgroundColor: active
                    ? theme.colors.primary
                    : done
                      ? theme.colors.successSoft
                      : theme.colors.surfaceElevated,
                  borderColor: active
                    ? theme.colors.primary
                    : done
                      ? theme.colors.success
                      : theme.colors.border,
                },
              ]}
            >
              <Text
                style={[
                  theme.typography.caption,
                  {
                    color: active
                      ? theme.colors.primaryText
                      : done
                        ? theme.colors.success
                        : theme.colors.textSecondary,
                    fontWeight: '700',
                  },
                ]}
                numberOfLines={1}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.md,
          gap: theme.spacing.md,
          paddingBottom: theme.spacing.xxl,
        }}
      >
        {errorMsg ? (
          <Card variant="subtle" style={{ backgroundColor: theme.colors.errorSoft, borderColor: theme.colors.error }}>
            <Text style={[theme.typography.bodySm, { color: theme.colors.error }]}>
              {errorMsg}
            </Text>
          </Card>
        ) : null}

        {/* STEP 1: Delivery Address or Pickup */}
        {step === 1 ? (
          orderType === 'pickup' ? (
            <Card variant="elevated" style={{ gap: theme.spacing.sm }}>
              <View style={styles.inlineRow}>
                <Store size={20} color={theme.colors.primary} />
                <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
                  {t.menu.pickup}
                </Text>
              </View>
              <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
                {t.checkout.pickupNotice}
              </Text>
              {settings?.address ? (
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                  {settings.address}
                </Text>
              ) : null}
            </Card>
          ) : (
            <Card variant="elevated" style={{ gap: theme.spacing.sm }}>
              <View style={styles.inlineRow}>
                <MapPin size={18} color={theme.colors.primary} />
                <Text style={[theme.typography.titleSm, { color: theme.colors.text, flex: 1 }]}>
                  {t.checkout.selectAddress}
                </Text>
                <Button
                  label={t.checkout.addAddress}
                  variant="outline"
                  size="sm"
                  onPress={() => router.push('/addresses')}
                />
              </View>

              {(addressesQuery.data?.addresses ?? []).map((addr) => {
                const active = selectedAddress?.id === addr.id;
                return (
                  <Pressable
                    key={addr.id}
                    onPress={() => setSelectedAddressId(addr.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.choiceCard,
                      {
                        minHeight: theme.hitTarget.min,
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                        backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface,
                        borderRadius: theme.radii.sm,
                        padding: theme.spacing.sm,
                      },
                    ]}
                  >
                    <View style={styles.inlineRow}>
                      <Text style={[theme.typography.titleSm, { color: theme.colors.text, flex: 1 }]}>
                        {addr.label}
                      </Text>
                      {active ? <CheckCircle2 size={18} color={theme.colors.primary} /> : null}
                    </View>
                    <Text style={[theme.typography.bodySm, { color: theme.colors.textSecondary }]}>
                      {addr.fullAddress}
                    </Text>
                  </Pressable>
                );
              })}

              {(addressesQuery.data?.addresses ?? []).length === 0 ? (
                <Text style={[theme.typography.bodySm, { color: theme.colors.textMuted }]}>
                  {t.checkout.selectAddress}
                </Text>
              ) : null}

              {needsDeliveryPhone ? (
                <View
                  style={{
                    marginTop: theme.spacing.sm,
                    paddingTop: theme.spacing.sm,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.colors.border,
                    gap: theme.spacing.xs,
                  }}
                >
                  <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
                    {t.checkout.contactPhoneTitle}
                  </Text>
                  <Text style={[theme.typography.bodySm, { color: theme.colors.textSecondary }]}>
                    {t.checkout.contactPhoneHint}
                  </Text>
                  <View
                    style={[
                      styles.inlineRow,
                      {
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        borderRadius: theme.radii.sm,
                        paddingHorizontal: theme.spacing.sm,
                        height: 46,
                        backgroundColor: theme.colors.surfaceElevated,
                      },
                    ]}
                  >
                    <Text style={[theme.typography.body, { color: theme.colors.text, fontWeight: '700' }]}>
                      +90
                    </Text>
                    <TextInput
                      testID="checkout-phone-input"
                      value={contactPhoneInput}
                      onChangeText={setContactPhoneInput}
                      placeholder={t.auth.phonePlaceholder}
                      placeholderTextColor={theme.colors.textMuted}
                      keyboardType="phone-pad"
                      maxLength={14}
                      style={[theme.typography.body, { flex: 1, color: theme.colors.text }]}
                    />
                  </View>
                  <Button
                    testID="checkout-save-phone-btn"
                    title={t.checkout.contactPhoneSave}
                    loading={savingPhone}
                    onPress={() => void handleSaveContactPhone()}
                  />
                </View>
              ) : null}
            </Card>
          )
        ) : null}

        {/* STEP 2: Payment & Note */}
        {step === 2 ? (
          <View style={{ gap: theme.spacing.md }}>
            <Card variant="elevated" style={{ gap: theme.spacing.sm }}>
              <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
                {t.checkout.paymentMethod}
              </Text>

              <Pressable
                onPress={() => setPaymentMethod('card_online')}
                accessibilityRole="radio"
                accessibilityState={{ selected: paymentMethod === 'card_online' }}
                style={[
                  styles.choiceCard,
                  {
                    minHeight: theme.hitTarget.min,
                    borderColor:
                      paymentMethod === 'card_online'
                        ? theme.colors.primary
                        : theme.colors.border,
                    backgroundColor:
                      paymentMethod === 'card_online'
                        ? theme.colors.primarySoft
                        : theme.colors.surface,
                    borderRadius: theme.radii.sm,
                    padding: theme.spacing.sm,
                    gap: 6,
                  },
                ]}
              >
                <View style={styles.inlineRow}>
                  <CreditCard size={18} color={theme.colors.primary} />
                  <Text style={[theme.typography.titleSm, { color: theme.colors.text, flex: 1 }]}>
                    {t.checkout.cardOnline}
                  </Text>
                  {paymentMethod === 'card_online' ? (
                    <CheckCircle2 size={18} color={theme.colors.primary} />
                  ) : null}
                </View>
                <View style={styles.inlineRow}>
                  <ShieldCheck size={14} color={theme.colors.success} />
                  <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, flex: 1 }]}>
                    {t.checkout.cardOnlineHint}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                disabled={codExceeded}
                onPress={() => setPaymentMethod('cash_on_delivery')}
                accessibilityRole="radio"
                accessibilityState={{
                  selected: paymentMethod === 'cash_on_delivery',
                  disabled: codExceeded,
                }}
                style={[
                  styles.choiceCard,
                  {
                    minHeight: theme.hitTarget.min,
                    borderColor:
                      paymentMethod === 'cash_on_delivery'
                        ? theme.colors.primary
                        : theme.colors.border,
                    backgroundColor:
                      paymentMethod === 'cash_on_delivery'
                        ? theme.colors.primarySoft
                        : theme.colors.surface,
                    borderRadius: theme.radii.sm,
                    padding: theme.spacing.sm,
                    opacity: codExceeded ? 0.52 : 1,
                    gap: 4,
                  },
                ]}
              >
                <View style={styles.inlineRow}>
                  <Banknote size={18} color={theme.colors.accent} />
                  <Text style={[theme.typography.titleSm, { color: theme.colors.text, flex: 1 }]}>
                    {t.checkout.cashOnDelivery}
                  </Text>
                  {paymentMethod === 'cash_on_delivery' ? (
                    <CheckCircle2 size={18} color={theme.colors.primary} />
                  ) : null}
                </View>
                {codExceeded ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.error }]}>
                    {t.checkout.codLimitExceeded}
                  </Text>
                ) : null}
              </Pressable>
            </Card>

            <Card variant="elevated" style={{ gap: theme.spacing.xs }}>
              <Text style={[theme.typography.label, { color: theme.colors.text }]}>
                {t.checkout.orderNote}
              </Text>
              <TextInput
                value={customerNote}
                onChangeText={(txt) => setCustomerNote(txt.slice(0, 120))}
                maxLength={120}
                placeholder={t.menu.notePlaceholder}
                placeholderTextColor={theme.colors.textMuted}
                style={[
                  theme.typography.body,
                  styles.noteInput,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radii.sm,
                    padding: theme.spacing.sm,
                  },
                ]}
              />
            </Card>
          </View>
        ) : null}

        {/* STEP 3: Quoted Review & Place Order */}
        {step === 3 ? (
          <View style={{ gap: theme.spacing.md }}>
            <Card variant="elevated" style={{ gap: theme.spacing.xs }}>
              <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
                {orderType === 'pickup' ? t.menu.pickup : t.menu.delivery}
              </Text>
              <Text style={[theme.typography.bodySm, { color: theme.colors.textSecondary }]}>
                {orderType === 'pickup'
                  ? t.checkout.pickupNotice
                  : selectedAddress
                    ? `${selectedAddress.label} — ${selectedAddress.fullAddress}`
                    : t.checkout.selectAddress}
              </Text>
              <Badge
                label={
                  paymentMethod === 'card_online'
                    ? t.checkout.cardOnline
                    : t.checkout.cashOnDelivery
                }
                tone="neutral"
              />
            </Card>

            {quote ? (
              <Card variant="elevated" style={{ gap: theme.spacing.xs }}>
                <View style={styles.summaryRow}>
                  <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
                    {t.cart.subtotal}
                  </Text>
                  <PriceText kurus={quote.subtotal_kurus} locale={language} />
                </View>
                {quote.discount_kurus > 0 ? (
                  <View style={styles.summaryRow}>
                    <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
                      {t.cart.discount}
                    </Text>
                    <PriceText
                      kurus={-quote.discount_kurus}
                      locale={language}
                      style={{ color: theme.colors.success }}
                    />
                  </View>
                ) : null}
                {orderType === 'delivery' ? (
                  <View style={styles.summaryRow}>
                    <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>
                      {t.cart.deliveryFee}
                    </Text>
                    <PriceText kurus={quote.delivery_fee_kurus} locale={language} />
                  </View>
                ) : null}
                <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
                <View style={styles.summaryRow}>
                  <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
                    {t.cart.total}
                  </Text>
                  <PriceText
                    kurus={quote.total_kurus}
                    locale={language}
                    style={{ fontSize: 18, fontWeight: '700' }}
                  />
                </View>
              </Card>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {/* Bottom Action Footer */}
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
        {step < 3 ? (
          <Button
            label={step === 1 ? t.checkout.step2 : t.checkout.step3}
            fullWidth
            disabled={step === 1 && !canProceedStep1}
            onPress={() => setStep((s) => (s + 1) as CheckoutStep)}
          />
        ) : (
          <Button
            label={
              submitting
                ? t.checkout.recheckingAvailability
                : quote
                  ? `${t.checkout.placeOrder} • ${formatTryFromKurus(quote.total_kurus, language)}`
                  : t.checkout.placeOrder
            }
            fullWidth
            loading={submitting}
            onPress={() => void handlePlaceOrder()}
          />
        )}
      </View>
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
  stepperRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  stepPill: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  choiceCard: {
    borderWidth: 1,
  },
  noteInput: {
    borderWidth: 1,
    minHeight: 68,
    textAlignVertical: 'top',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  footer: {
    borderTopWidth: 1,
  },
});
