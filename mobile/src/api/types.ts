import type { OrderStatus, PaymentMethod, OrderType, SupportedLanguage } from '@kardesler/shared';

export interface MenuCategoryDto {
  id: string;
  sortOrder: number;
  name: string;
  description: string | null;
}

export interface MenuOptionDto {
  id: string;
  groupId: string;
  menuItemId: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  groupName: string;
  priceDeltaKurus: number;
  isAvailable: boolean;
  name: string;
}

export interface MenuItemDto {
  id: string;
  categoryId: string;
  priceKurus: number;
  vatRatePercent: number;
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
  allergens: string[];
  name: string;
  description: string | null;
  options: MenuOptionDto[];
}

export interface MenuResponseDto {
  language: SupportedLanguage;
  categories: MenuCategoryDto[];
  items: MenuItemDto[];
}

export interface BannerDto {
  id: string;
  imageUrl: string;
  titleTranslations: Record<string, string>;
  targetType: string;
  targetId: string | null;
  sortOrder: number;
}

export interface PublicSettingsDto {
  name: string;
  phone: string;
  address: string;
  currency: string;
  minAppVersion?: string;
  openingHours: Record<string, { open: string; close: string }>;
  codMaxAmountKurus: number;
  isAcceptingOrders: boolean;
  heartbeatAlive: boolean;
  orderingAvailable: boolean;
}

export interface DeliveryCheckDto {
  covered: boolean;
  zone: {
    id: string;
    name: string;
    minOrderKurus: number;
    deliveryFeeKurus: number;
    estimatedMinutes: number;
  } | null;
}

export interface QuoteResponseDto {
  subtotal_kurus: number;
  discount_kurus: number;
  delivery_fee_kurus: number;
  total_kurus: number;
  min_order_kurus_applied: number;
  is_min_order_met: boolean;
  min_order_shortfall_kurus: number;
  coupon_applied: { code: string; discount_kurus: number } | null;
}

export interface UserProfileDto {
  id: string;
  phone: string | null;
  name: string | null;
  email?: string | null;
  preferredLanguage?: SupportedLanguage;
  referralCode: string;
}

export interface AddressDto {
  id: string;
  label: string;
  fullAddress: string;
  building: string | null;
  floor: string | null;
  apartment: string | null;
  notes: string | null;
  lat: number;
  lng: number;
}

export interface OrderSummaryDto {
  id: string;
  orderNumber: number;
  businessDate: string;
  orderType: OrderType;
  status: OrderStatus;
  subtotalKurus: number;
  discountKurus: number;
  deliveryFeeKurus: number;
  totalKurus: number;
  paymentMethod: PaymentMethod;
  createdAt?: string;
}

export interface CreateOrderResponseDto extends OrderSummaryDto {
  paymentCheckout: {
    checkoutUrl: string;
    sessionId: string;
    expiresAt?: string;
  } | null;
}

export interface OrderDetailDto {
  order: OrderSummaryDto & {
    customerNameSnapshot?: string;
    customerPhoneSnapshot?: string;
    addressSnapshot?: unknown;
    customerNote?: string | null;
    cancelReason?: string | null;
  };
  items: {
    id: string;
    menuItemId: string;
    nameSnapshot: string;
    quantity: number;
    unitPriceKurus: number;
    totalPriceKurus: number;
    selectedOptions?: { name: string; priceDeltaKurus: number }[];
  }[];
  events: {
    id: string;
    toStatus: OrderStatus;
    createdAt: string;
    note?: string | null;
  }[];
}

export interface LoyaltyDto {
  pointsBalance: number;
  totalEarnedPoints?: number;
  transactions?: {
    id: string;
    pointsDelta: number;
    reason: string;
    createdAt: string;
  }[];
}

