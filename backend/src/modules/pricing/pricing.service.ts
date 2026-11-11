import {
  type CartItemDto,
  type PriceCalculationDto,
  type PricingBreakdownDto,
} from '@kardesler/shared';

export interface MenuItemPricingData {
  id: string;
  name: string;
  priceKurus: number;
  vatRatePercent: number;
  isAvailable: boolean;
  options: {
    id: string;
    groupId: string;
    name: string;
    priceDeltaKurus: number;
    isAvailable: boolean;
  }[];
}

export interface CouponData {
  id: string;
  code: string;
  type: 'percent' | 'fixed_amount' | 'free_item';
  value: number;
  maxDiscountKurus?: number | null;
  minOrderKurus: number;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  maxTotalUses?: number | null;
  usedCount: number;
}

export interface DeliveryZoneData {
  id: string;
  name: string;
  minOrderKurus: number;
  deliveryFeeKurus: number;
}

export class PricingEngine {
  /**
   * Computes authoritative order totals entirely on the server.
   * Client-supplied prices are strictly ignored.
   */
  public static calculate(
    dto: PriceCalculationDto,
    menuData: Map<string, MenuItemPricingData>,
    isRestaurantOpen: boolean,
    isAcceptingOrders: boolean,
    coupon?: CouponData | null,
    deliveryZone?: DeliveryZoneData | null,
  ): PricingBreakdownDto {
    // 1. Restaurant availability checks
    if (!isAcceptingOrders) {
      throw new Error('Restoran şu anda sipariş kabul etmemektedir (Orders paused).');
    }
    if (!isRestaurantOpen) {
      throw new Error('Restoran şu anda kapalıdır (Restaurant closed).');
    }

    // 2. Validate items and options
    let subtotalKurus = 0;

    for (const cartItem of dto.items) {
      const item = menuData.get(cartItem.menu_item_id);
      if (!item) {
        throw new Error(`Menü öğesi bulunamadı (Item ${cartItem.menu_item_id} not found).`);
      }
      if (!item.isAvailable) {
        throw new Error(`"${item.name}" şu anda tükenmiştir (Item out of stock).`);
      }
      if (cartItem.quantity <= 0) {
        throw new Error(`Geçersiz ürün adedi: ${cartItem.quantity}`);
      }

      // Base price
      let unitPriceKurus = item.priceKurus;

      // Validate selected options
      const availableOptionIds = new Set(item.options.map((o) => o.id));
      for (const optId of cartItem.option_ids) {
        if (!availableOptionIds.has(optId)) {
          throw new Error(
            `Seçilen opsiyon "${item.name}" ürününe ait değildir (Invalid option ${optId}).`,
          );
        }
        const option = item.options.find((o) => o.id === optId);
        if (option && !option.isAvailable) {
          throw new Error(`Seçilen opsiyon "${option.name}" tükenmiştir.`);
        }
        if (option) {
          unitPriceKurus += option.priceDeltaKurus;
        }
      }

      const lineTotal = unitPriceKurus * cartItem.quantity;
      subtotalKurus += lineTotal;
    }

    // 3. Evaluate Coupon Discount
    let discountKurus = 0;
    let appliedCouponInfo: { code: string; discount_kurus: number } | null = null;

    if (coupon && coupon.isActive) {
      const now = new Date();
      if (now >= coupon.startsAt && now <= coupon.endsAt) {
        if (subtotalKurus >= coupon.minOrderKurus) {
          if (coupon.type === 'percent') {
            const rawDiscount = Math.round((subtotalKurus * coupon.value) / 100);
            discountKurus = coupon.maxDiscountKurus
              ? Math.min(rawDiscount, coupon.maxDiscountKurus)
              : rawDiscount;
          } else if (coupon.type === 'fixed_amount') {
            discountKurus = Math.min(coupon.value, subtotalKurus);
          }

          appliedCouponInfo = {
            code: coupon.code,
            discount_kurus: discountKurus,
          };
        }
      }
    }

    // Discount cannot exceed subtotal
    discountKurus = Math.min(discountKurus, subtotalKurus);

    // 4. Delivery fee (always 0 for Kardeşler Cihangir, default fallback)
    const deliveryFeeKurus = deliveryZone ? deliveryZone.deliveryFeeKurus : 0;

    // 5. Compute final payable total in integer kuruş
    const totalKurus = subtotalKurus - discountKurus + deliveryFeeKurus;

    // 6. Check Minimum Spend AFTER Discount
    const minOrderKurusApplied = deliveryZone ? deliveryZone.minOrderKurus : 0;
    const isMinOrderMet = totalKurus >= minOrderKurusApplied;
    const shortfallKurus = isMinOrderMet ? 0 : minOrderKurusApplied - totalKurus;

    return {
      subtotal_kurus: subtotalKurus,
      discount_kurus: discountKurus,
      delivery_fee_kurus: deliveryFeeKurus,
      total_kurus: totalKurus,
      min_order_kurus_applied: minOrderKurusApplied,
      is_min_order_met: isMinOrderMet,
      min_order_shortfall_kurus: shortfallKurus,
      coupon_applied: appliedCouponInfo,
    };
  }
}
