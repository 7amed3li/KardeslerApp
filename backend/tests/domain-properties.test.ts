import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PricingDomain, type PricedMenuItem } from '../src/domain/pricing/pricing.domain.js';
import { calculateCouponDiscountKurus, evaluateCouponForQuote, isCouponActiveAt, type CouponRule } from '../src/domain/coupons/coupon.domain.js';
import { LoyaltyDomain } from '../src/domain/loyalty/loyalty.domain.js';
import { PaymentDomain } from '../src/domain/payments/payment.domain.js';
import { DeliveryDomain } from '../src/domain/delivery/delivery.domain.js';
import { ThermalTicketDomain } from '../src/domain/print/thermal-ticket.domain.js';
import { OrderStateMachine } from '../src/domain/orders/order-state-machine.js';

describe('Step 5 Pure Domain & Property-Based Tests', () => {
  const baseMenu = new Map<string, PricedMenuItem>([
    [
      'item-1',
      {
        id: 'item-1',
        categoryId: 'cat-1',
        name: 'Adana Kebap',
        priceKurus: 34000,
        vatRatePercent: 1,
        isAvailable: true,
        optionGroups: [{ id: 'g1', minSelect: 1, maxSelect: 1, isRequired: true, isActive: true }],
        options: [
          { id: 'opt-1', groupId: 'g1', name: '1 Porsiyon', priceDeltaKurus: 0, isAvailable: true },
          { id: 'opt-2', groupId: 'g1', name: '1.5 Porsiyon', priceDeltaKurus: 16000, isAvailable: true },
          { id: 'opt-out', groupId: 'g1', name: 'Tükendi', priceDeltaKurus: 1000, isAvailable: false },
        ],
      },
    ],
  ]);

  it('property: integer kuruş pricing never produces NaN, floats, negative totals, or discount > subtotal', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.boolean(),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 500000 }),
        (qty, useDelta, pct, maxDisc) => {
          const coupon: CouponRule = {
            id: 'c1',
            code: 'PROP',
            type: 'percent',
            value: pct,
            maxDiscountKurus: maxDisc,
            minOrderKurus: 0,
            startsAt: new Date(Date.now() - 60_000),
            endsAt: new Date(Date.now() + 60_000),
            isActive: true,
            usedCount: 0,
          };
          const res = PricingDomain.calculateQuote({
            input: {
              items: [{ menuItemId: 'item-1', quantity: qty, optionIds: [useDelta ? 'opt-2' : 'opt-1'] }],
              orderType: 'delivery',
              now: new Date(),
            },
            menuMap: baseMenu,
            isRestaurantOpen: true,
            isAcceptingOrders: true,
            coupon,
            deliveryZone: { id: 'z1', name: 'Z1', minOrderKurus: 25000, deliveryFeeKurus: 0 },
          });

          expect(Number.isInteger(res.subtotalKurus)).toBe(true);
          expect(Number.isInteger(res.discountKurus)).toBe(true);
          expect(Number.isInteger(res.totalKurus)).toBe(true);
          expect(res.discountKurus).toBeGreaterThanOrEqual(0);
          expect(res.discountKurus).toBeLessThanOrEqual(res.subtotalKurus);
          expect(res.totalKurus).toBe(res.subtotalKurus - res.discountKurus + res.deliveryFeeKurus);
          expect(res.isMinOrderMet).toBe(res.totalKurus >= 25000);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('property: fixed_amount and percent coupon discounts are always bounded [0, subtotal]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2_000_000 }),
        fc.integer({ min: 1, max: 500_000 }),
        fc.constantFrom<'percent' | 'fixed_amount' | 'free_item'>('percent', 'fixed_amount', 'free_item'),
        (subtotal, value, type) => {
          const disc = calculateCouponDiscountKurus(
            {
              id: 'c',
              code: 'T',
              type,
              value: type === 'percent' ? Math.min(value, 100) : value,
              maxDiscountKurus: 25000,
              minOrderKurus: 0,
              startsAt: new Date(0),
              endsAt: new Date(Date.now() + 10_000),
              isActive: true,
              usedCount: 0,
            },
            subtotal,
          );
          expect(Number.isInteger(disc)).toBe(true);
          expect(disc).toBeGreaterThanOrEqual(0);
          expect(disc).toBeLessThanOrEqual(subtotal);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('validates strict coupon targeting (categories, items, firstOrderOnly, caps, activeHours) & option rules', () => {
    const now = new Date('2026-11-11T12:00:00Z');
    const baseCoupon: CouponRule = {
      id: 'c1',
      code: 'TARGET',
      type: 'fixed_amount',
      value: 5000,
      minOrderKurus: 10000,
      startsAt: new Date('2026-11-01T00:00:00Z'),
      endsAt: new Date('2026-12-01T00:00:00Z'),
      isActive: true,
      maxTotalUses: 5,
      usedCount: 1,
      maxUsesPerUser: 1,
      firstOrderOnly: true,
      appliesTo: 'categories',
      targetCategoryIds: ['cat-2'],
    };

    expect(() =>
      evaluateCouponForQuote(baseCoupon, {
        subtotalKurus: 34000,
        now,
        userRedemptionsCount: 0,
        userDeliveredOrdersCount: 0,
        cartItems: [{ menuItemId: 'item-1', categoryId: 'cat-1' }],
      }, true),
    ).toThrow(/kategorideki/);

    expect(() =>
      evaluateCouponForQuote({ ...baseCoupon, appliesTo: 'items', targetMenuItemIds: ['other'] }, {
        subtotalKurus: 34000,
        now,
        userRedemptionsCount: 0,
        userDeliveredOrdersCount: 0,
        cartItems: [{ menuItemId: 'item-1', categoryId: 'cat-1' }],
      }, true),
    ).toThrow(/ürünlerde/);

    expect(() =>
      evaluateCouponForQuote({ ...baseCoupon, appliesTo: 'all' }, {
        subtotalKurus: 34000,
        now,
        userRedemptionsCount: 0,
        userDeliveredOrdersCount: 1,
        cartItems: [{ menuItemId: 'item-1', categoryId: 'cat-1' }],
      }, true),
    ).toThrow(/ilk siparişlerde/);

    expect(() =>
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
        menuMap: baseMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
      }),
    ).toThrow(/zorunlu seçenek/);

    expect(() =>
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-1', quantity: 1, optionIds: ['opt-out'] }], orderType: 'pickup', now },
        menuMap: baseMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
      }),
    ).toThrow(/tükenmiştir/);
  });

  it('covers LoyaltyDomain, PaymentDomain, DeliveryDomain, OrderStateMachine COD/cancel, and ThermalTicketDomain', () => {
    expect(LoyaltyDomain.calculateDeliveryRewards(30499, true)).toEqual({
      orderPoints: 304,
      referrerBonusPoints: 100,
      referredBonusPoints: 50,
    });
    expect(LoyaltyDomain.calculateOrderPoints(-10)).toBe(0);

    expect(PaymentDomain.decideWebhookOutcome({ orderStatus: 'awaiting_payment', expectedTotalKurus: 1000, receivedAmountKurus: 900, webhookStatus: 'paid' })).toEqual({ action: 'fraud_mismatch' });
    expect(PaymentDomain.decideWebhookOutcome({ orderStatus: 'awaiting_payment', expectedTotalKurus: 1000, receivedAmountKurus: 1000, webhookStatus: 'paid' })).toEqual({ action: 'mark_paid', nextOrderStatus: 'new' });
    expect(PaymentDomain.shouldAutoRefund('card_online', 'paid')).toBe(true);
    expect(PaymentDomain.shouldAutoRefund('cash_on_delivery', 'paid')).toBe(false);

    expect(DeliveryDomain.evaluateCoverage(null)).toEqual({ covered: false, zone: null });
    expect(() => DeliveryDomain.requireCoveredZone(null)).toThrow(/bölgesi dışında/);

    expect(() => OrderStateMachine.assertCustomerCanCancel('accepted')).toThrow(/iptal edilemez/);
    expect(() =>
      OrderStateMachine.assertCodEligibility({
        paymentMethod: 'cash_on_delivery',
        totalKurus: 200000,
        maxAmountKurus: 150000,
        openCodOrdersCount: 0,
        maxOpenCodOrders: 1,
      }),
    ).toThrow(/limiti/);

    const ticket = ThermalTicketDomain.formatKitchenTicket({
      orderNumber: 77,
      businessDate: '2026-11-11',
      orderType: 'delivery',
      paymentMethod: 'cash_on_delivery',
      customerName: 'Çağrı Şen',
      customerPhone: '+905331112233',
      addressText: 'İstiklal Cad. No:5',
      customerNote: 'Acısız olsun',
      items: [{ quantity: 1, nameTr: 'Künefe', unitPriceKurus: 18000, lineTotalKurus: 18000, options: [{ nameTr: 'Kaymaklı', priceDeltaKurus: 3000 }] }],
      subtotalKurus: 18000,
      discountKurus: 1000,
      totalKurus: 17000,
      createdAt: new Date(),
    });
    expect(ticket.textTr).toContain('SİPARİŞ NO: #77');
    expect(Buffer.from(ticket.escPosBase64, 'base64').length).toBeGreaterThan(50);
  });

  it('kills boundary & equality mutants in PricingDomain and CouponDomain', () => {
    const start = new Date('2026-11-11T09:00:00Z'); // 12:00 Europe/Istanbul
    const end = new Date('2026-11-11T17:00:00Z'); // 20:00 Europe/Istanbul
    const cpn = {
      id: 'c-bnd',
      code: 'BND',
      type: 'fixed_amount' as const,
      value: 4000,
      minOrderKurus: 34000,
      startsAt: start,
      endsAt: end,
      isActive: true,
      maxTotalUses: 2,
      usedCount: 1,
      maxUsesPerUser: 1,
      firstOrderOnly: false,
      appliesTo: 'all' as const,
      activeHours: { start: '11:00', end: '21:00' },
    };

    // Exact start/end timestamps are active; 1ms outside are inactive
    expect(isCouponActiveAt(cpn, start)).toBe(true);
    expect(isCouponActiveAt(cpn, end)).toBe(true);
    expect(isCouponActiveAt(cpn, new Date(start.getTime() - 1))).toBe(false);
    expect(isCouponActiveAt(cpn, new Date(end.getTime() + 1))).toBe(false);
    // Istanbul activeHours window boundary (22:00 Istanbul = 19:00 UTC)
    expect(isCouponActiveAt({ ...cpn, endsAt: new Date('2026-12-01T00:00:00Z') }, new Date('2026-11-11T19:00:00Z'))).toBe(false);
    // Exact minOrderKurus equality accepted; 1 kuruş below returns null by default (strict=false)
    const cpnCtx = {
      subtotalKurus: 34000,
      now: start,
      userRedemptionsCount: 0,
      userDeliveredOrdersCount: 0,
      cartItems: [{ menuItemId: 'item-1', categoryId: 'cat-1' }],
    };
    expect(evaluateCouponForQuote(cpn, cpnCtx)?.discountKurus).toBe(4000);
    expect(evaluateCouponForQuote(cpn, { ...cpnCtx, subtotalKurus: 33999 })).toBeNull();
    // Undefined target lists safely reject matching categories/items without throwing
    expect(evaluateCouponForQuote({ ...cpn, appliesTo: 'categories' }, cpnCtx)).toBeNull();
    expect(evaluateCouponForQuote({ ...cpn, appliesTo: 'items' }, cpnCtx)).toBeNull();
    // Exact totalKurus === minOrderKurusApplied is valid; 1 kuruş below fails; deliveryFee added; pickup ignores zone
    const exactQuote = PricingDomain.calculateQuote({
      input: { items: [{ menuItemId: 'item-1', quantity: 1, optionIds: ['opt-1'] }], orderType: 'delivery', now: start },
      menuMap: baseMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      deliveryZone: { id: 'z1', name: 'Z', minOrderKurus: 35500, deliveryFeeKurus: 1500 },
    });
    expect(exactQuote.totalKurus).toBe(35500);
    expect(exactQuote.isMinOrderMet).toBe(true);

    const pickupWithZone = PricingDomain.calculateQuote({
      input: { items: [{ menuItemId: 'item-1', quantity: 1, optionIds: ['opt-1'] }], orderType: 'pickup', now: start },
      menuMap: baseMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      deliveryZone: { id: 'z1', name: 'Z', minOrderKurus: 999999, deliveryFeeKurus: 1500 },
    });
    expect(pickupWithZone.deliveryFeeKurus).toBe(0);
    expect(pickupWithZone.minOrderKurusApplied).toBe(0);
    expect(pickupWithZone.isMinOrderMet).toBe(true);
  });
});

