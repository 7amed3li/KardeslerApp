import { describe, it, expect } from 'vitest';
import { PricingDomain, type PricedMenuItem } from '../src/domain/pricing/pricing.domain.js';
import {
  type CouponRule,
  isCouponActiveAt,
  calculateCouponDiscountKurus,
  evaluateCouponForQuote,
} from '../src/domain/coupons/coupon.domain.js';

describe('PricingDomain Unit Tests', () => {
  const now = new Date();
  const baseCoupon: CouponRule = {
    id: 'c-test',
    code: 'TESTCODE',
    type: 'percent',
    value: 10,
    maxDiscountKurus: null,
    minOrderKurus: 10000,
    startsAt: new Date(now.getTime() - 100000),
    endsAt: new Date(now.getTime() + 100000),
    isActive: true,
    usedCount: 0,
    maxTotalUses: 10,
    maxUsesPerUser: 2,
    firstOrderOnly: true,
    appliesTo: 'all',
  };

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

  it('rejects order when restaurant is closed', () => {
    try {
      PricingDomain.calculateQuote({
        input: {
          items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }],
          orderType: 'delivery',
          now,
        },
        menuMap: sampleMenu,
        isRestaurantOpen: false,
        isAcceptingOrders: true,
      });
      expect.fail('should have thrown');
    } catch (e: any) {
      expect(e.code).toBe('RESTAURANT_CLOSED');
      expect(e.statusCode).toBe(503);
      expect(e.message).toBe('Restoran şu anda kapalıdır');
    }
  });

  it('kills all coupon evaluation and boundary mutants', () => {
    // strict = true on missing coupon
    try {
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
        menuMap: sampleMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
        coupon: null,
        strictCoupon: true,
      });
      expect.fail('should throw');
    } catch (e: any) {
      expect(e.code).toBe('INVALID_COUPON');
      expect(e.statusCode).toBe(422);
      expect(e.message).toBe('Kupon bulunamadı');
    }

    // activeHours format with 8-character strings and partial activeHours
    const couponWith8CharHours: CouponRule = {
      ...baseCoupon,
      activeHours: { start: '00:00:00', end: '23:59:59' },
    };
    const res8 = PricingDomain.calculateQuote({
      input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
      menuMap: sampleMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      coupon: couponWith8CharHours,
    });
    expect(res8.discountKurus).toBe(3400);

    // activeHours partial (start only or end only)
    const couponPartialHours: CouponRule = {
      ...baseCoupon,
      activeHours: { start: '00:00', end: '' },
    };
    const resPartial = PricingDomain.calculateQuote({
      input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
      menuMap: sampleMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      coupon: couponPartialHours,
    });
    expect(resPartial.discountKurus).toBe(3400);

    // strict = true error branches
    const expiredCoupon: CouponRule = { ...baseCoupon, endsAt: new Date(now.getTime() - 1000) };
    expect(() =>
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
        menuMap: sampleMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
        coupon: expiredCoupon,
        strictCoupon: true,
      }),
    ).toThrowError('Kupon aktif değil veya süresi dolmuş');

    const exhaustedCoupon: CouponRule = { ...baseCoupon, usedCount: 10, maxTotalUses: 10 };
    expect(() =>
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
        menuMap: sampleMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
        coupon: exhaustedCoupon,
        strictCoupon: true,
      }),
    ).toThrowError('Kupon toplam kullanım sınırına ulaştı');

    const userExhausted: CouponRule = { ...baseCoupon, maxUsesPerUser: 2 };
    expect(() =>
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now, userRedemptionsCount: 2 },
        menuMap: sampleMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
        coupon: userExhausted,
        strictCoupon: true,
      }),
    ).toThrowError('Kullanıcı kupon sınırına ulaştı');

    const notFirstOrder: CouponRule = { ...baseCoupon, firstOrderOnly: true };
    expect(() =>
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now, userDeliveredOrdersCount: 1 },
        menuMap: sampleMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
        coupon: notFirstOrder,
        strictCoupon: true,
      }),
    ).toThrowError('Bu kupon yalnızca ilk siparişlerde geçerlidir');

    const minNotMet: CouponRule = { ...baseCoupon, minOrderKurus: 50000 };
    expect(() =>
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
        menuMap: sampleMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
        coupon: minNotMet,
        strictCoupon: true,
      }),
    ).toThrowError('Sepet tutarı kupon minimum şartının altında');

    const catMismatch: CouponRule = { ...baseCoupon, appliesTo: 'categories', targetCategoryIds: ['other-cat'] };
    expect(() =>
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
        menuMap: sampleMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
        coupon: catMismatch,
        strictCoupon: true,
      }),
    ).toThrowError('Kupon bu kategorideki ürünlerde geçerli değil');

    const catMatch: CouponRule = { ...baseCoupon, appliesTo: 'categories', targetCategoryIds: ['cat-1'] };
    const resCat = PricingDomain.calculateQuote({
      input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
      menuMap: sampleMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      coupon: catMatch,
      strictCoupon: true,
    });
    expect(resCat.discountKurus).toBe(3400);

    const itemMismatch: CouponRule = { ...baseCoupon, appliesTo: 'items', targetMenuItemIds: ['other-item'] };
    expect(() =>
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
        menuMap: sampleMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
        coupon: itemMismatch,
        strictCoupon: true,
      }),
    ).toThrowError('Kupon seçili ürünlerde geçerli değil');

    const itemMatch: CouponRule = { ...baseCoupon, appliesTo: 'items', targetMenuItemIds: ['item-adana-1'] };
    const resItem = PricingDomain.calculateQuote({
      input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
      menuMap: sampleMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      coupon: itemMatch,
      strictCoupon: true,
    });
    expect(resItem.discountKurus).toBe(3400);

    // free_item type produces 0 discount
    const freeItemCoupon: CouponRule = { ...baseCoupon, type: 'free_item', value: 0 };
    const resFree = PricingDomain.calculateQuote({
      input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
      menuMap: sampleMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      coupon: freeItemCoupon,
    });
    expect(resFree.discountKurus).toBe(0);

    // fixed amount capped at subtotal
    const giantFixed: CouponRule = { ...baseCoupon, type: 'fixed_amount', value: 999999 };
    const resGiant = PricingDomain.calculateQuote({
      input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
      menuMap: sampleMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      coupon: giantFixed,
    });
    expect(resGiant.discountKurus).toBe(34000);
    expect(resGiant.totalKurus).toBe(0);
  });

  it('kills all options, line validation and delivery calculation mutants', () => {
    const complexMenu: Map<string, PricedMenuItem> = new Map([
      [
        'item-burger',
        {
          id: 'item-burger',
          categoryId: 'cat-2',
          name: 'Burger',
          priceKurus: 20000,
          vatRatePercent: 1,
          isAvailable: true,
          optionGroups: [
            { id: 'grp-sauce', minSelect: 1, maxSelect: 2, isRequired: true, isActive: true },
            { id: 'grp-addon', minSelect: 0, maxSelect: 1, isRequired: false, isActive: true },
            { id: 'grp-inactive', minSelect: 2, maxSelect: 2, isRequired: true, isActive: false },
          ],
          options: [
            { id: 'opt-mayo', groupId: 'grp-sauce', name: 'Mayonez', priceDeltaKurus: 0, isAvailable: true },
            { id: 'opt-ketchup', groupId: 'grp-sauce', name: 'Ketçap', priceDeltaKurus: 500, isAvailable: true },
            { id: 'opt-mustard', groupId: 'grp-sauce', name: 'Hardal', priceDeltaKurus: 500, isAvailable: true },
            { id: 'opt-cheese', groupId: 'grp-addon', name: 'Peynir', priceDeltaKurus: 2000, isAvailable: true },
            { id: 'opt-bacon', groupId: 'grp-addon', name: 'Bacon', priceDeltaKurus: 3000, isAvailable: false },
            { id: 'opt-ghost', groupId: 'grp-other', name: 'Ghost', priceDeltaKurus: 0, isAvailable: true },
          ],
        },
      ],
    ]);

    // Duplicate option id
    expect(() =>
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-burger', quantity: 1, optionIds: ['opt-mayo', 'opt-mayo'] }], orderType: 'pickup', now },
        menuMap: complexMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
      }),
    ).toThrowError(/Mükerrer opsiyon seçimi/);

    // Option not in item
    expect(() =>
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-burger', quantity: 1, optionIds: ['non-existent-opt'] }], orderType: 'pickup', now },
        menuMap: complexMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
      }),
    ).toThrowError(/ürününe ait değildir/);

    // Unavailable option
    expect(() =>
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-burger', quantity: 1, optionIds: ['opt-bacon'] }], orderType: 'pickup', now },
        menuMap: complexMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
      }),
    ).toThrowError(/tükenmiştir/);

    // Missing required option (< minReq)
    expect(() =>
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-burger', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
        menuMap: complexMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
      }),
    ).toThrowError(/zorunlu seçenek sayısı/);

    // Exceeding maxSelect
    expect(() =>
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-burger', quantity: 1, optionIds: ['opt-mayo', 'opt-ketchup', 'opt-mustard'] }], orderType: 'pickup', now },
        menuMap: complexMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
      }),
    ).toThrowError(/zorunlu seçenek sayısı/);

    // Invalid item id
    expect(() =>
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'unknown-item', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
        menuMap: complexMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
      }),
    ).toThrowError(/bulunamadı/);

    // Invalid quantities: 0, negative, > 99, float
    for (const badQty of [0, -1, 100, 1.5]) {
      expect(() =>
        PricingDomain.calculateQuote({
          input: { items: [{ menuItemId: 'item-burger', quantity: badQty, optionIds: ['opt-mayo'] }], orderType: 'pickup', now },
          menuMap: complexMenu,
          isRestaurantOpen: true,
          isAcceptingOrders: true,
        }),
      ).toThrowError(/Geçersiz ürün adedi/);
    }

    // Pickup order has 0 delivery fee even if deliveryZone is supplied
    const pickupRes = PricingDomain.calculateQuote({
      input: { items: [{ menuItemId: 'item-burger', quantity: 1, optionIds: ['opt-mayo'] }], orderType: 'pickup', now },
      menuMap: complexMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      deliveryZone: { id: 'z1', name: 'Z1', minOrderKurus: 15000, deliveryFeeKurus: 2500 },
    });
    expect(pickupRes.deliveryFeeKurus).toBe(0);
    expect(pickupRes.minOrderKurusApplied).toBe(0);
    expect(pickupRes.isMinOrderMet).toBe(true);

    // Delivery order exact minOrder match
    const exactMinRes = PricingDomain.calculateQuote({
      input: { items: [{ menuItemId: 'item-burger', quantity: 1, optionIds: ['opt-mayo'] }], orderType: 'delivery', now },
      menuMap: complexMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      deliveryZone: { id: 'z1', name: 'Z1', minOrderKurus: 20000, deliveryFeeKurus: 2500 },
    });
    expect(exactMinRes.isMinOrderMet).toBe(true);
    expect(exactMinRes.minOrderShortfallKurus).toBe(0);

    // Delivery order 1 kuruş below minOrder
    const belowMinRes = PricingDomain.calculateQuote({
      input: { items: [{ menuItemId: 'item-burger', quantity: 1, optionIds: ['opt-mayo'] }], orderType: 'delivery', now },
      menuMap: complexMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      deliveryZone: { id: 'z1', name: 'Z1', minOrderKurus: 22501, deliveryFeeKurus: 2500 },
    });
    expect(belowMinRes.isMinOrderMet).toBe(false);
    expect(belowMinRes.minOrderShortfallKurus).toBe(1);
    // Quantity boundary: exactly 99 is valid, 100 is invalid
    const valid99 = PricingDomain.calculateQuote({
      input: { items: [{ menuItemId: 'item-burger', quantity: 99, optionIds: ['opt-mayo'] }], orderType: 'pickup', now },
      menuMap: complexMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
    });
    expect(valid99.subtotalKurus).toBe(1980000);

    // Assert exact error codes and status codes
    try {
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'non-existent', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
        menuMap: complexMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
      });
      expect.fail('should throw');
    } catch (e: any) {
      expect(e.code).toBe('NOT_FOUND');
      expect(e.statusCode).toBe(404);
    }

    try {
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-sold-out', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
        menuMap: sampleMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
      });
      expect.fail('should throw');
    } catch (e: any) {
      expect(e.code).toBe('ITEM_UNAVAILABLE');
      expect(e.statusCode).toBe(422);
    }

    try {
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-adana-1', quantity: 0, optionIds: [] }], orderType: 'pickup', now },
        menuMap: sampleMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
      });
      expect.fail('should throw');
    } catch (e: any) {
      expect(e.code).toBe('VALIDATION_ERROR');
      expect(e.statusCode).toBe(400);
    }

    try {
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
        menuMap: sampleMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: false,
      });
      expect.fail('should throw');
    } catch (e: any) {
      expect(e.code).toBe('RESTAURANT_PAUSED');
      expect(e.statusCode).toBe(503);
    }

    // Active hours outside window check
    const istanbulDateAtNight = new Date('2026-06-15T01:30:00Z'); // 04:30 AM Istanbul time
    const daytimeCoupon: CouponRule = {
      ...baseCoupon,
      activeHours: { start: '10:00', end: '22:00' },
    };
    const resNight = PricingDomain.calculateQuote({
      input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now: istanbulDateAtNight },
      menuMap: sampleMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      coupon: daytimeCoupon,
    });
    expect(resNight.discountKurus).toBe(0); // Inactive outside hours

    // Active hours 8-char format: length === 5 vs !== 5
    const daytime8CharCoupon: CouponRule = {
      ...baseCoupon,
      activeHours: { start: '10:00:00', end: '22:00:00' },
    };
    const resNight8 = PricingDomain.calculateQuote({
      input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now: istanbulDateAtNight },
      menuMap: sampleMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      coupon: daytime8CharCoupon,
    });
    expect(resNight8.discountKurus).toBe(0);

    // Exact equality boundary tests for coupon rules
    const exactTotalUsesCoupon: CouponRule = { ...baseCoupon, maxTotalUses: 5, usedCount: 5 };
    expect(() =>
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
        menuMap: sampleMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
        coupon: exactTotalUsesCoupon,
        strictCoupon: true,
      }),
    ).toThrowError('Kupon toplam kullanım sınırına ulaştı');

    const exactUserUsesCoupon: CouponRule = { ...baseCoupon, maxUsesPerUser: 1 };
    expect(() =>
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now, userRedemptionsCount: 1 },
        menuMap: sampleMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
        coupon: exactUserUsesCoupon,
        strictCoupon: true,
      }),
    ).toThrowError('Kullanıcı kupon sınırına ulaştı');

    const exactMinOrderCoupon: CouponRule = { ...baseCoupon, minOrderKurus: 34000 };
    const resExactMin = PricingDomain.calculateQuote({
      input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
      menuMap: sampleMenu,
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      coupon: exactMinOrderCoupon,
      strictCoupon: true,
    });
    expect(resExactMin.discountKurus).toBe(3400); // 34000 >= 34000 passes!

    const oneKurusBelowCoupon: CouponRule = { ...baseCoupon, minOrderKurus: 34001 };
    expect(() =>
      PricingDomain.calculateQuote({
        input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
        menuMap: sampleMenu,
        isRestaurantOpen: true,
        isAcceptingOrders: true,
        coupon: oneKurusBelowCoupon,
        strictCoupon: true,
      }),
    ).toThrowError('Sepet tutarı kupon minimum şartının altında');

    // Subtotal <= 0 discount calculation
    const zeroSubtotalRes = PricingDomain.calculateQuote({
      input: { items: [{ menuItemId: 'item-adana-1', quantity: 1, optionIds: [] }], orderType: 'pickup', now },
      menuMap: new Map([['item-adana-1', { ...sampleMenu.get('item-adana-1')!, priceKurus: 0 }]]),
      isRestaurantOpen: true,
      isAcceptingOrders: true,
      coupon: baseCoupon,
    });
    expect(zeroSubtotalRes.discountKurus).toBe(0);
  });

  it('kills all surviving mutants directly in coupon.domain', () => {
    const testNow = new Date('2026-06-15T12:00:00Z'); // 15:00 Istanbul time
    const coupon: CouponRule = {
      ...baseCoupon,
      startsAt: new Date(testNow.getTime() - 1000),
      endsAt: new Date(testNow.getTime() + 1000),
      activeHours: { start: '10:00', end: '20:00' },
    };

    // isCouponActiveAt start and end boundary
    expect(isCouponActiveAt(coupon, new Date(coupon.startsAt.getTime()))).toBe(true);
    expect(isCouponActiveAt(coupon, new Date(coupon.endsAt.getTime()))).toBe(true);
    expect(isCouponActiveAt(coupon, new Date(coupon.startsAt.getTime() - 1))).toBe(false);
    expect(isCouponActiveAt(coupon, new Date(coupon.endsAt.getTime() + 1))).toBe(false);
    expect(isCouponActiveAt({ ...coupon, isActive: false }, testNow)).toBe(false);

    // Active hours length 8 and length 5
    const coupon5 = { ...coupon, activeHours: { start: '14:00', end: '16:00' } };
    expect(isCouponActiveAt(coupon5, testNow)).toBe(true);
    const coupon8 = { ...coupon, activeHours: { start: '14:00:00', end: '16:00:00' } };
    expect(isCouponActiveAt(coupon8, testNow)).toBe(true);

    const couponBeforeStart = { ...coupon, activeHours: { start: '16:00', end: '18:00' } };
    expect(isCouponActiveAt(couponBeforeStart, testNow)).toBe(false);
    const couponAfterEnd = { ...coupon, activeHours: { start: '10:00', end: '14:00' } };
    expect(isCouponActiveAt(couponAfterEnd, testNow)).toBe(false);

    // calculateCouponDiscountKurus boundaries
    expect(calculateCouponDiscountKurus(coupon, 0)).toBe(0);
    expect(calculateCouponDiscountKurus(coupon, -100)).toBe(0);
    expect(calculateCouponDiscountKurus({ ...coupon, type: 'percent', value: 20, maxDiscountKurus: null }, 10000)).toBe(2000);
    expect(calculateCouponDiscountKurus({ ...coupon, type: 'percent', value: 20, maxDiscountKurus: 1500 }, 10000)).toBe(1500);
    expect(calculateCouponDiscountKurus({ ...coupon, type: 'fixed_amount', value: 5000 }, 10000)).toBe(5000);
    expect(calculateCouponDiscountKurus({ ...coupon, type: 'fixed_amount', value: 15000 }, 10000)).toBe(10000);
    expect(calculateCouponDiscountKurus({ ...coupon, type: 'free_item', value: 0 }, 10000)).toBe(0);

    // evaluateCouponForQuote boundaries
    const ctx = {
      subtotalKurus: 10000,
      now: testNow,
      userRedemptionsCount: 0,
      userDeliveredOrdersCount: 0,
      cartItems: [{ menuItemId: 'item-adana-1', categoryId: 'cat-1' }],
    };

    expect(evaluateCouponForQuote(null, ctx, false)).toBeNull();
    expect(() => evaluateCouponForQuote(null, ctx, true)).toThrowError('Kupon bulunamadı');

    expect(evaluateCouponForQuote({ ...coupon, maxTotalUses: 5, usedCount: 4 }, ctx, true)).not.toBeNull();
    expect(() => evaluateCouponForQuote({ ...coupon, maxTotalUses: 5, usedCount: 5 }, ctx, true)).toThrowError('toplam kullanım');

    expect(evaluateCouponForQuote({ ...coupon, maxUsesPerUser: 1 }, { ...ctx, userRedemptionsCount: 0 }, true)).not.toBeNull();
    expect(() => evaluateCouponForQuote({ ...coupon, maxUsesPerUser: 1 }, { ...ctx, userRedemptionsCount: 1 }, true)).toThrowError('Kullanıcı kupon sınırına');

    expect(evaluateCouponForQuote({ ...coupon, firstOrderOnly: true }, { ...ctx, userDeliveredOrdersCount: 0 }, true)).not.toBeNull();
    expect(() => evaluateCouponForQuote({ ...coupon, firstOrderOnly: true }, { ...ctx, userDeliveredOrdersCount: 1 }, true)).toThrowError('ilk siparişlerde');

    expect(evaluateCouponForQuote({ ...coupon, minOrderKurus: 10000 }, { ...ctx, subtotalKurus: 10000 }, true)).not.toBeNull();
    expect(() => evaluateCouponForQuote({ ...coupon, minOrderKurus: 10000 }, { ...ctx, subtotalKurus: 9999 }, true)).toThrowError('şartının altında');

    // non-strict (strict = false) returns null on all failure paths
    expect(evaluateCouponForQuote({ ...coupon, isActive: false }, ctx, false)).toBeNull();
    expect(evaluateCouponForQuote({ ...coupon, maxTotalUses: 5, usedCount: 5 }, ctx, false)).toBeNull();
    expect(evaluateCouponForQuote({ ...coupon, maxUsesPerUser: 1 }, { ...ctx, userRedemptionsCount: 1 }, false)).toBeNull();
    expect(evaluateCouponForQuote({ ...coupon, firstOrderOnly: true }, { ...ctx, userDeliveredOrdersCount: 1 }, false)).toBeNull();
    expect(evaluateCouponForQuote({ ...coupon, minOrderKurus: 20000 }, { ...ctx, subtotalKurus: 10000 }, false)).toBeNull();
    expect(evaluateCouponForQuote({ ...coupon, appliesTo: 'categories', targetCategoryIds: ['none'] }, ctx, false)).toBeNull();
    expect(evaluateCouponForQuote({ ...coupon, appliesTo: 'items', targetMenuItemIds: ['none'] }, ctx, false)).toBeNull();

    // Math.round rounding verification in calculateCouponDiscountKurus
    expect(calculateCouponDiscountKurus({ ...coupon, type: 'percent', value: 15, maxDiscountKurus: null }, 1005)).toBe(151);

    // Active hours exact start/end boundary: 15:00:00 Istanbul time
    const exactStartCoupon = { ...coupon, activeHours: { start: '15:00', end: '16:00' } };
    expect(isCouponActiveAt(exactStartCoupon, testNow)).toBe(true);
    const exactEndCoupon = { ...coupon, activeHours: { start: '14:00', end: '15:00' } };
    expect(isCouponActiveAt(exactEndCoupon, testNow)).toBe(true);

    // Active hours partial: missing start or missing end
    expect(isCouponActiveAt({ ...coupon, activeHours: { start: '10:00', end: '' as any } }, testNow)).toBe(true);
    expect(isCouponActiveAt({ ...coupon, activeHours: { start: '' as any, end: '20:00' } }, testNow)).toBe(true);
  });
});
