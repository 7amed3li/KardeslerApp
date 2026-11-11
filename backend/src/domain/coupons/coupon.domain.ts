import { DomainError } from '../errors.js';

export interface CouponRule {
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
  maxUsesPerUser?: number;
  firstOrderOnly?: boolean;
  appliesTo?: 'all' | 'categories' | 'items';
  activeHours?: { start: string; end: string } | null;
  targetCategoryIds?: readonly string[];
  targetMenuItemIds?: readonly string[];
}

export interface CouponEvaluationContext {
  subtotalKurus: number;
  now: Date;
  userRedemptionsCount: number;
  userDeliveredOrdersCount: number;
  cartItems: readonly { menuItemId: string; categoryId: string }[];
}

function getIstanbulTimeHhMm(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
  return parts;
}

export function isCouponActiveAt(coupon: CouponRule, now: Date): boolean {
  if (!coupon.isActive) return false;
  if (now.getTime() < coupon.startsAt.getTime() || now.getTime() > coupon.endsAt.getTime()) {
    return false;
  }
  if (coupon.activeHours?.start && coupon.activeHours?.end) {
    const current = getIstanbulTimeHhMm(now);
    const start = coupon.activeHours.start.length === 5 ? `${coupon.activeHours.start}:00` : coupon.activeHours.start;
    const end = coupon.activeHours.end.length === 5 ? `${coupon.activeHours.end}:59` : coupon.activeHours.end;
    if (current < start || current > end) return false;
  }
  return true;
}

export function calculateCouponDiscountKurus(coupon: CouponRule, subtotalKurus: number): number {
  if (subtotalKurus <= 0) return 0;
  if (coupon.type === 'percent') {
    const raw = Math.round((subtotalKurus * coupon.value) / 100);
    const capped = coupon.maxDiscountKurus != null ? Math.min(raw, coupon.maxDiscountKurus) : raw;
    return Math.min(capped, subtotalKurus);
  }
  if (coupon.type === 'fixed_amount') {
    return Math.min(coupon.value, subtotalKurus);
  }
  return 0;
}

export function evaluateCouponForQuote(
  coupon: CouponRule | null | undefined,
  ctx: CouponEvaluationContext,
  strict = false,
): { code: string; discountKurus: number } | null {
  if (!coupon) {
    if (strict) throw new DomainError('INVALID_COUPON', 422, 'Kupon bulunamadı');
    return null;
  }

  const failOrNull = (msg: string): null => {
    if (strict) throw new DomainError('INVALID_COUPON', 422, msg);
    return null;
  };

  if (!isCouponActiveAt(coupon, ctx.now)) return failOrNull('Kupon aktif değil veya süresi dolmuş');
  if (coupon.maxTotalUses != null && coupon.usedCount >= coupon.maxTotalUses) {
    return failOrNull('Kupon toplam kullanım sınırına ulaştı');
  }
  if (coupon.maxUsesPerUser != null && ctx.userRedemptionsCount >= coupon.maxUsesPerUser) {
    return failOrNull('Kullanıcı kupon sınırına ulaştı');
  }
  if (coupon.firstOrderOnly && ctx.userDeliveredOrdersCount > 0) {
    return failOrNull('Bu kupon yalnızca ilk siparişlerde geçerlidir');
  }
  if (ctx.subtotalKurus < coupon.minOrderKurus) {
    return failOrNull('Sepet tutarı kupon minimum şartının altında');
  }
  if (coupon.appliesTo === 'categories') {
    const allowed = new Set(coupon.targetCategoryIds ?? []);
    if (!ctx.cartItems.some((item) => allowed.has(item.categoryId))) {
      return failOrNull('Kupon bu kategorideki ürünlerde geçerli değil');
    }
  }
  if (coupon.appliesTo === 'items') {
    const allowed = new Set(coupon.targetMenuItemIds ?? []);
    if (!ctx.cartItems.some((item) => allowed.has(item.menuItemId))) {
      return failOrNull('Kupon seçili ürünlerde geçerli değil');
    }
  }

  return {
    code: coupon.code,
    discountKurus: calculateCouponDiscountKurus(coupon, ctx.subtotalKurus),
  };
}

