import { DomainError } from '../errors.js';
import { evaluateCouponForQuote, type CouponRule } from '../coupons/coupon.domain.js';

export interface PricedMenuItem {
  id: string;
  categoryId: string;
  name: string;
  priceKurus: number;
  vatRatePercent: number;
  isAvailable: boolean;
  optionGroups: {
    id: string;
    minSelect: number;
    maxSelect: number;
    isRequired: boolean;
    isActive: boolean;
  }[];
  options: {
    id: string;
    groupId: string;
    name: string;
    priceDeltaKurus: number;
    isAvailable: boolean;
  }[];
}

export interface DeliveryZoneRule {
  id: string;
  name: string;
  minOrderKurus: number;
  deliveryFeeKurus: number;
}

export interface CartQuoteInput {
  items: readonly { menuItemId: string; quantity: number; optionIds: readonly string[] }[];
  orderType: 'delivery' | 'pickup';
  now: Date;
  userRedemptionsCount?: number;
  userDeliveredOrdersCount?: number;
}

export interface QuoteBreakdown {
  subtotalKurus: number;
  discountKurus: number;
  deliveryFeeKurus: number;
  totalKurus: number;
  minOrderKurusApplied: number;
  isMinOrderMet: boolean;
  minOrderShortfallKurus: number;
  couponApplied: { code: string; discountKurus: number } | null;
}

function validateItemOptions(
  item: PricedMenuItem,
  optionIds: readonly string[],
): number {
  const uniqueIds = new Set(optionIds);
  if (uniqueIds.size !== optionIds.length) {
    throw new DomainError('VALIDATION_ERROR', 400, `Mükerrer opsiyon seçimi: ${item.name}`);
  }

  const optMap = new Map(item.options.map((o) => [o.id, o]));
  let optionsDelta = 0;

  for (const optId of optionIds) {
    const opt = optMap.get(optId);
    if (!opt) {
      throw new DomainError(
        'ITEM_UNAVAILABLE',
        422,
        `Seçilen opsiyon "${item.name}" ürününe ait değildir`,
      );
    }
    if (!opt.isAvailable) {
      throw new DomainError('ITEM_UNAVAILABLE', 422, `Seçilen opsiyon "${opt.name}" tükenmiştir`);
    }
    optionsDelta += opt.priceDeltaKurus;
  }

  for (const grp of item.optionGroups) {
    if (!grp.isActive) continue;
    const countInGrp = optionIds.filter((id) => optMap.get(id)?.groupId === grp.id).length;
    const minReq = grp.isRequired ? Math.max(grp.minSelect, 1) : grp.minSelect;
    if (countInGrp < minReq || countInGrp > grp.maxSelect) {
      throw new DomainError(
        'ITEM_UNAVAILABLE',
        422,
        `"${item.name}" için zorunlu seçenek sayısı kuralları sağlanmadı`,
      );
    }
  }

  return optionsDelta;
}

function resolveCartLines(
  items: CartQuoteInput['items'],
  menuMap: Map<string, PricedMenuItem>,
): { subtotalKurus: number; cartItems: { menuItemId: string; categoryId: string }[] } {
  let subtotalKurus = 0;
  const cartItems: { menuItemId: string; categoryId: string }[] = [];

  for (const line of items) {
    const item = menuMap.get(line.menuItemId);
    if (!item) throw new DomainError('NOT_FOUND', 404, `Menü öğesi bulunamadı: ${line.menuItemId}`);
    if (!item.isAvailable) throw new DomainError('ITEM_UNAVAILABLE', 422, `"${item.name}" şu anda mevcut değil`);
    if (!Number.isInteger(line.quantity) || line.quantity <= 0 || line.quantity > 99) {
      throw new DomainError('VALIDATION_ERROR', 400, `Geçersiz ürün adedi: ${line.quantity}`);
    }
    const delta = validateItemOptions(item, line.optionIds);
    subtotalKurus += (item.priceKurus + delta) * line.quantity;
    cartItems.push({ menuItemId: item.id, categoryId: item.categoryId });
  }
  return { subtotalKurus, cartItems };
}

export class PricingDomain {
  public static calculateQuote(params: {
    input: CartQuoteInput;
    menuMap: Map<string, PricedMenuItem>;
    isRestaurantOpen: boolean;
    isAcceptingOrders: boolean;
    coupon?: CouponRule | null;
    deliveryZone?: DeliveryZoneRule | null;
    strictCoupon?: boolean;
  }): QuoteBreakdown {
    if (!params.isAcceptingOrders) {
      throw new DomainError('RESTAURANT_PAUSED', 503, 'Restoran şu anda yeni sipariş kabul etmiyor');
    }
    if (!params.isRestaurantOpen) {
      throw new DomainError('RESTAURANT_CLOSED', 503, 'Restoran şu anda kapalıdır');
    }

    const { subtotalKurus, cartItems } = resolveCartLines(params.input.items, params.menuMap);

    const couponResult = evaluateCouponForQuote(
      params.coupon,
      {
        subtotalKurus,
        now: params.input.now,
        userRedemptionsCount: params.input.userRedemptionsCount ?? 0,
        userDeliveredOrdersCount: params.input.userDeliveredOrdersCount ?? 0,
        cartItems,
      },
      params.strictCoupon ?? false,
    );

    const discountKurus = couponResult ? Math.min(couponResult.discountKurus, subtotalKurus) : 0;
    const deliveryFeeKurus =
      params.input.orderType === 'delivery' && params.deliveryZone
        ? params.deliveryZone.deliveryFeeKurus
        : 0;
    const totalKurus = subtotalKurus - discountKurus + deliveryFeeKurus;
    const minOrderKurusApplied =
      params.input.orderType === 'delivery' && params.deliveryZone
        ? params.deliveryZone.minOrderKurus
        : 0;
    const isMinOrderMet = totalKurus >= minOrderKurusApplied;

    return {
      subtotalKurus,
      discountKurus,
      deliveryFeeKurus,
      totalKurus,
      minOrderKurusApplied,
      isMinOrderMet,
      minOrderShortfallKurus: isMinOrderMet ? 0 : minOrderKurusApplied - totalKurus,
      couponApplied: couponResult,
    };
  }
}
