import { describe, it, expect } from 'vitest';
import { PricingDomain, type PricedMenuItem } from '../src/domain/pricing/pricing.domain.js';
import type { CouponRule } from '../src/domain/coupons/coupon.domain.js';

describe('PricingDomain Unit Tests', () => {
  const now = new Date();
  const sampleMenu: Map<string, PricedMenuItem> = new Map([
    [
      'item-adana-1',
      {
        id: 'item-adana-1',
        categoryId: 'cat-1',
        name: 'Adana Kebap',
        priceKurus: 34000,
        vatRatePercent: 1,
        isAvailable: true,
        optionGroups: [],
        options: [
          {
            id: 'opt-portion-1.5',
            groupId: 'grp-portion',
            name: '1.5 Porsiyon',
            priceDeltaKurus: 16000,
            isAvailable: true,
          },
        ],
      },
    ],
    [
      'item-sold-out',
      {
        id: 'item-sold-out',
        categoryId: 'cat-1',
        name: 'Künefe',
        priceKurus: 18000,
        vatRatePercent: 1,
        isAvailable: false,
        optionGroups: [],
        options: [],
      },
    ],
  ]);

  it('correctly calculates basic order subtotal in integer kuruş', () => {
    const res = PricingDomain.calculateQuote({
      input: {
        items: [{ menuItemId: 'item-adana-1', quantity: 2, optionIds: [] }],
        orderType: 'delivery',
        now,
      },
      menuMap: sampleMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      deliveryZone: { id: 'zone-1', name: 'Cihangir', minOrderKurus: 25000, deliveryFeeKurus: 0 },
    });
    expect(res.subtotalKurus).toBe(68000);
    expect(res.discountKurus).toBe(0);
    expect(res.deliveryFeeKurus).toBe(0);
    expect(res.totalKurus).toBe(68000);
    expect(res.isMinOrderMet).toBe(true);
  });

  it('correctly adds option price deltas to item unit price', () => {
    const res = PricingDomain.calculateQuote({
      input: {
        items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: ['opt-portion-1.5'] }],
        orderType: 'delivery',
        now,
      },
      menuMap: sampleMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      deliveryZone: { id: 'zone-1', name: 'Cihangir', minOrderKurus: 25000, deliveryFeeKurus: 0 },
    });
    expect(res.subtotalKurus).toBe(50000);
    expect(res.totalKurus).toBe(50000);
  });

  it('applies percentage coupon up to maximum discount cap', () => {
    const coupon: CouponRule = {
      id: 'coupon-1',
      code: 'HOSGELDIN',
      type: 'percent',
      value: 20,
      maxDiscountKurus: 10000,
      minOrderKurus: 30000,
      startsAt: new Date(now.getTime() - 10000),
      endsAt: new Date(now.getTime() + 100000),
      isActive: true,
      usedCount: 0,
    };
    const res = PricingDomain.calculateQuote({
      input: {
        items: [{ menuItemId: 'item-adana-1', quantity: 2, optionIds: [] }],
        orderType: 'delivery',
        now,
      },
      menuMap: sampleMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      coupon,
      deliveryZone: { id: 'zone-1', name: 'Cihangir', minOrderKurus: 25000, deliveryFeeKurus: 0 },
    });
    expect(res.subtotalKurus).toBe(68000);
    expect(res.discountKurus).toBe(10000);
    expect(res.totalKurus).toBe(58000);
  });

  it('enforces minimum order spend AFTER discount is deducted', () => {
    const fixedCoupon: CouponRule = {
      id: 'coupon-fixed',
      code: 'INDIRIM150',
      type: 'fixed_amount',
      value: 15000,
      minOrderKurus: 30000,
      startsAt: new Date(now.getTime() - 10000),
      endsAt: new Date(now.getTime() + 100000),
      isActive: true,
      usedCount: 0,
    };
    const res = PricingDomain.calculateQuote({
      input: {
        items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }],
        orderType: 'delivery',
        now,
      },
      menuMap: sampleMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      coupon: fixedCoupon,
      deliveryZone: { id: 'zone-1', name: 'Cihangir', minOrderKurus: 25000, deliveryFeeKurus: 0 },
    });
    expect(res.totalKurus).toBe(19000);
    expect(res.isMinOrderMet).toBe(false);
    expect(res.minOrderShortfallKurus).toBe(6000);
  });

  it('rejects order when item is out of stock', () => {
    expect(() =>
      PricingDomain.calculateQuote({
        input: {
          items: [{ menuItemId: 'item-sold-out', quantity: 1, optionIds: [] }],
          orderType: 'delivery',
          now,
        },
        menuMap: sampleMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
      }),
    ).toThrowError(/mevcut değil/);
  });

  it('rejects order when restaurant has paused intake', () => {
    expect(() =>
      PricingDomain.calculateQuote({
        input: {
          items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }],
          orderType: 'delivery',
          now,
        },
        menuMap: sampleMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: false,
      }),
    ).toThrowError(/kabul etmiyor/);
  });
});
