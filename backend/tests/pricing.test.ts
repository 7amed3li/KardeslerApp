import { describe, it, expect } from 'vitest';
import { PricingEngine, type MenuItemPricingData, type CouponData } from '../src/modules/pricing/pricing.service.js';

describe('PricingEngine Unit Tests', () => {
  const sampleMenu: Map<string, MenuItemPricingData> = new Map([
    [
      'item-adana-1',
      {
        id: 'item-adana-1',
        name: 'Adana Kebap',
        priceKurus: 34000, // 340 TL
        vatRatePercent: 1,
        isAvailable: true,
        options: [
          {
            id: 'opt-portion-1.5',
            groupId: 'grp-portion',
            name: '1.5 Porsiyon',
            priceDeltaKurus: 16000, // +160 TL
            isAvailable: true,
          },
        ],
      },
    ],
    [
      'item-sold-out',
      {
        id: 'item-sold-out',
        name: 'Künefe',
        priceKurus: 18000,
        vatRatePercent: 1,
        isAvailable: false, // Out of stock
        options: [],
      },
    ],
  ]);

  it('correctly calculates basic order subtotal in integer kuruş', () => {
    const res = PricingEngine.calculate(
      {
        items: [{ menu_item_id: 'item-adana-1', quantity: 2, option_ids: [] }],
        order_type: 'delivery',
      },
      sampleMenu,
      true,
      true,
      null,
      { id: 'zone-1', name: 'Cihangir', minOrderKurus: 25000, deliveryFeeKurus: 0 },
    );

    expect(res.subtotal_kurus).toBe(68000); // 340 * 2 = 680 TL
    expect(res.discount_kurus).toBe(0);
    expect(res.delivery_fee_kurus).toBe(0);
    expect(res.total_kurus).toBe(68000);
    expect(res.is_min_order_met).toBe(true);
  });

  it('correctly adds option price deltas to item unit price', () => {
    const res = PricingEngine.calculate(
      {
        items: [
          {
            menu_item_id: 'item-adana-1',
            quantity: 1,
            option_ids: ['opt-portion-1.5'],
          },
        ],
        order_type: 'delivery',
      },
      sampleMenu,
      true,
      true,
      null,
      { id: 'zone-1', name: 'Cihangir', minOrderKurus: 25000, deliveryFeeKurus: 0 },
    );

    expect(res.subtotal_kurus).toBe(50000); // 340 + 160 = 500 TL
    expect(res.total_kurus).toBe(50000);
  });

  it('applies percentage coupon up to maximum discount cap', () => {
    const coupon: CouponData = {
      id: 'coupon-1',
      code: 'HOSGELDIN',
      type: 'percent',
      value: 20, // 20%
      maxDiscountKurus: 10000, // Max 100 TL
      minOrderKurus: 30000,
      startsAt: new Date(Date.now() - 10000),
      endsAt: new Date(Date.now() + 100000),
      isActive: true,
      usedCount: 0,
    };

    // Subtotal: 680 TL. 20% of 680 = 136 TL. Capped at 100 TL (10000 kuruş).
    const res = PricingEngine.calculate(
      {
        items: [{ menu_item_id: 'item-adana-1', quantity: 2, option_ids: [] }],
        coupon_code: 'HOSGELDIN',
        order_type: 'delivery',
      },
      sampleMenu,
      true,
      true,
      coupon,
      { id: 'zone-1', name: 'Cihangir', minOrderKurus: 25000, deliveryFeeKurus: 0 },
    );

    expect(res.subtotal_kurus).toBe(68000);
    expect(res.discount_kurus).toBe(10000); // Max cap applied
    expect(res.total_kurus).toBe(58000); // 680 - 100 = 580 TL
  });

  it('enforces minimum order spend AFTER discount is deducted', () => {
    const fixedCoupon: CouponData = {
      id: 'coupon-fixed',
      code: 'INDIRIM150',
      type: 'fixed_amount',
      value: 15000, // 150 TL discount
      minOrderKurus: 30000,
      startsAt: new Date(Date.now() - 10000),
      endsAt: new Date(Date.now() + 100000),
      isActive: true,
      usedCount: 0,
    };

    // Item subtotal = 340 TL. Discount = 150 TL. Total = 190 TL.
    // Minimum zone spend = 250 TL.
    // Result: Minimum order is NOT met after discount!
    const res = PricingEngine.calculate(
      {
        items: [{ menu_item_id: 'item-adana-1', quantity: 1, option_ids: [] }],
        coupon_code: 'INDIRIM150',
        order_type: 'delivery',
      },
      sampleMenu,
      true,
      true,
      fixedCoupon,
      { id: 'zone-1', name: 'Cihangir', minOrderKurus: 25000, deliveryFeeKurus: 0 },
    );

    expect(res.subtotal_kurus).toBe(34000);
    expect(res.discount_kurus).toBe(15000);
    expect(res.total_kurus).toBe(19000);
    expect(res.is_min_order_met).toBe(false);
    expect(res.min_order_shortfall_kurus).toBe(6000); // 250 - 190 = 60 TL shortfall
  });

  it('rejects order when item is out of stock', () => {
    expect(() => {
      PricingEngine.calculate(
        {
          items: [{ menu_item_id: 'item-sold-out', quantity: 1, option_ids: [] }],
          order_type: 'delivery',
        },
        sampleMenu,
        true,
        true,
      );
    }).toThrowError(/tükenmiştir/);
  });

  it('rejects order when restaurant has paused intake', () => {
    expect(() => {
      PricingEngine.calculate(
        {
          items: [{ menu_item_id: 'item-adana-1', quantity: 1, option_ids: [] }],
          order_type: 'delivery',
        },
        sampleMenu,
        true,
        false, // Orders paused
      );
    }).toThrowError(/kabul etmemektedir/);
  });
});
