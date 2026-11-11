import { z } from 'zod';

// ----------------------------------------------------------------------------
// 1. CONSTANTS & DOMAIN ENUMS
// ----------------------------------------------------------------------------
export const SUPPORTED_LANGUAGES = ['tr', 'en', 'ar'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type LanguageCode = SupportedLanguage;

export const ORDER_TYPES = ['delivery', 'pickup'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUSES = [
  'awaiting_payment',
  'new',
  'accepted',
  'on_the_way',
  'delivered',
  'cancelled',
  'rejected',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ['card_online', 'cash_on_delivery'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const STAFF_ROLES = ['owner', 'staff'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const VALID_ALLERGENS = [
  'gluten',
  'dairy',
  'nuts',
  'peanuts',
  'eggs',
  'soy',
  'sesame',
  'celery',
  'mustard',
  'lupin',
  'fish',
  'crustaceans',
  'molluscs',
  'sulphites',
] as const;
export type Allergen = (typeof VALID_ALLERGENS)[number];

export const PHONE_E164_REGEX = /^\+[1-9]\d{7,14}$/;

// ----------------------------------------------------------------------------
// 2. FINANCIAL UTILITIES (INTEGER KURUŞ)
// ----------------------------------------------------------------------------
/**
 * Converts integer kuruş into formatted Turkish Lira display string
 * e.g., 34000 kuruş -> "340,00 ₺"
 */
export function formatKurus(kurus: number | bigint): string {
  const amount = Number(kurus) / 100;
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Converts decimal TRY string or number into safe integer kuruş
 * e.g., "340.50" -> 34050
 */
export function toKurus(lira: number | string): number {
  const val = typeof lira === 'string' ? parseFloat(lira) : lira;
  if (isNaN(val) || val < 0) {
    throw new Error(`Invalid lira amount: ${lira}`);
  }
  return Math.round(val * 100);
}

// ----------------------------------------------------------------------------
// 3. ZOD VALIDATION SCHEMAS
// ----------------------------------------------------------------------------

export const PhoneSchema = z
  .string()
  .trim()
  .regex(PHONE_E164_REGEX, 'Geçerli bir E.164 telefon numarası giriniz (ör: +905551234567)');

export const OtpRequestSchema = z.object({
  phone: PhoneSchema,
});
export type OtpRequestDto = z.infer<typeof OtpRequestSchema>;

export const OtpVerifySchema = z.object({
  phone: PhoneSchema,
  code: z.string().length(6, 'Doğrulama kodu 6 haneli olmalıdır'),
});
export type OtpVerifyDto = z.infer<typeof OtpVerifySchema>;

export const StaffLoginSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi giriniz'),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalıdır'),
  totp_code: z.string().length(6).optional(),
});
export type StaffLoginDto = z.infer<typeof StaffLoginSchema>;

export const CartItemOptionSchema = z.object({
  option_id: z.string().uuid(),
});

export const CartItemSchema = z.object({
  menu_item_id: z.string().uuid(),
  quantity: z.number().int().positive('Adet 1 veya daha fazla olmalıdır'),
  option_ids: z.array(z.string().uuid()).default([]),
});
export type CartItemDto = z.infer<typeof CartItemSchema>;

export const PriceCalculationSchema = z.object({
  items: z.array(CartItemSchema).min(1, 'Sepet boş olamaz'),
  coupon_code: z.string().trim().optional(),
  order_type: z.enum(ORDER_TYPES).default('delivery'),
  address_id: z.string().uuid().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});
export type PriceCalculationDto = z.infer<typeof PriceCalculationSchema>;

export const PricingBreakdownSchema = z.object({
  subtotal_kurus: z.number().int().nonnegative(),
  discount_kurus: z.number().int().nonnegative(),
  delivery_fee_kurus: z.number().int().nonnegative(),
  total_kurus: z.number().int().nonnegative(),
  min_order_kurus_applied: z.number().int().nonnegative(),
  is_min_order_met: z.boolean(),
  min_order_shortfall_kurus: z.number().int().nonnegative(),
  coupon_applied: z
    .object({
      code: z.string(),
      discount_kurus: z.number().int(),
    })
    .nullable(),
});
export type PricingBreakdownDto = z.infer<typeof PricingBreakdownSchema>;

export const CreateOrderSchema = z.object({
  idempotency_key: z.string().min(8, 'Idempotency key gereklidir'),
  order_type: z.enum(ORDER_TYPES),
  items: z.array(CartItemSchema).min(1, 'Sepet boş olamaz'),
  coupon_code: z.string().trim().optional(),
  address_id: z.string().uuid().optional(),
  customer_note: z.string().max(100, 'Müşteri notu en fazla 100 karakter olabilir').optional(),
  payment_method: z.enum(PAYMENT_METHODS),
});
export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;

export const OrderStatusTransitionSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  cancel_reason: z.string().optional(),
});
export type OrderStatusTransitionDto = z.infer<typeof OrderStatusTransitionSchema>;
