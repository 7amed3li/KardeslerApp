import { z } from 'zod';
import { ORDER_STATUSES, ORDER_TYPES, PAYMENT_METHODS, PHONE_E164_REGEX, SUPPORTED_LANGUAGES, VALID_ALLERGENS } from '@kardesler/shared';

export const UuidParamSchema = z.object({ id: z.string().uuid() }).strict();

export const OtpRequestBodySchema = z.object({
  phone: z.string().trim().regex(PHONE_E164_REGEX, 'Geçerli bir E.164 telefon numarası giriniz'),
}).strict();

export const OtpVerifyBodySchema = z.object({
  phone: z.string().trim().regex(PHONE_E164_REGEX),
  code: z.string().length(6, 'Doğrulama kodu 6 haneli olmalıdır'),
}).strict();

export const RefreshTokenBodySchema = z.object({
  refreshToken: z.string().min(32),
}).strict();

export const LogoutBodySchema = z.object({
  refreshToken: z.string().optional(),
}).strict().optional();

export const GoogleExchangeBodySchema = z.object({
  code: z.string().min(4).max(2048),
  codeVerifier: z.string().min(43).max(128),
  redirectUri: z.string().url().max(512),
  clientId: z.string().min(10).max(256),
  nonce: z.string().min(16).max(256),
}).strict();

export const GoogleLinkBodySchema = GoogleExchangeBodySchema;

export const UnlinkIdentityParamsSchema = z.object({
  provider: z.enum(['google']),
}).strict();

export const StaffLoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  totpCode: z.string().length(6).optional(),
}).strict();

export const TotpSetupBodySchema = z.object({
  setupToken: z.string().min(10),
}).strict();

export const TotpVerifySetupBodySchema = z.object({
  setupToken: z.string().min(10),
  secret: z.string().min(16),
  totpCode: z.string().length(6),
}).strict();

export const PrintAgentTokenIssueSchema = z.object({
  deviceId: z.string().min(2).max(100),
}).strict();

export const PrintAgentTokenRevokeSchema = z.object({
  jti: z.string().uuid(),
}).strict();

export const UpdateMeSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().trim().regex(PHONE_E164_REGEX, 'Geçerli bir E.164 telefon numarası giriniz').nullable().optional(),
  preferredLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
}).strict();

export const RegisterDeviceSchema = z.object({
  pushToken: z.string().min(10).max(500),
  platform: z.enum(['ios', 'android']),
  appVersion: z.string().min(1).max(30),
}).strict();

export const CreateAddressSchema = z.object({
  label: z.string().trim().min(1).max(50),
  fullAddress: z.string().trim().min(5).max(500),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  building: z.string().max(50).optional(),
  floor: z.string().max(20).optional(),
  apartment: z.string().max(20).optional(),
  notes: z.string().max(250).optional(),
}).strict();

export const UpdateAddressSchema = z.object({
  label: z.string().trim().min(1).max(50).optional(),
  fullAddress: z.string().trim().min(5).max(500).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  building: z.string().max(50).nullable().optional(),
  floor: z.string().max(20).nullable().optional(),
  apartment: z.string().max(20).nullable().optional(),
  notes: z.string().max(250).nullable().optional(),
}).strict();

export const DeliveryCheckSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
}).strict();

export const CartItemInputSchema = z.object({
  menu_item_id: z.string().uuid(),
  quantity: z.number().int().positive().max(99),
  option_ids: z.array(z.string().uuid()).default([]),
}).strict();

export const QuoteRequestSchema = z.object({
  items: z.array(CartItemInputSchema).min(1),
  order_type: z.enum(ORDER_TYPES).default('delivery'),
  coupon_code: z.string().trim().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
}).strict();

export const CreateOrderBodySchema = z.object({
  idempotency_key: z.string().min(8),
  order_type: z.enum(ORDER_TYPES),
  payment_method: z.enum(PAYMENT_METHODS),
  items: z.array(CartItemInputSchema).min(1),
  coupon_code: z.string().trim().optional(),
  address_id: z.string().uuid().optional(),
  address_snapshot: z.object({
    full_address: z.string().optional(),
    street: z.string().optional(),
    building: z.string().optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).strict().optional(),
  customer_note: z.string().max(100).optional(),
}).strict();

export const CancelOrderBodySchema = z.object({
  reason: z.string().max(200).optional(),
}).strict().optional();

export const StaffOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  cancel_reason: z.string().max(200).optional(),
}).strict();

export const AssignDriverSchema = z.object({
  driverId: z.string().uuid(),
}).strict();

export const PauseOrdersSchema = z.object({
  isAcceptingOrders: z.boolean(),
}).strict();

export const HeartbeatSchema = z.object({
  deviceId: z.string().min(1).max(120),
  kind: z.enum(['print_agent', 'staff_tablet']),
  meta: z.record(z.unknown()).optional(),
}).strict();

export const PrintAckSchema = z.object({
  status: z.enum(['printed', 'failed']),
  error: z.string().max(500).optional(),
}).strict();

export const WebhookBodySchema = z.object({
  providerEventId: z.string().min(3),
  orderId: z.string().uuid(),
  amountKurus: z.number().int().nonnegative(),
  status: z.enum(['paid', 'failed']),
  providerRef: z.string().min(1),
  signature: z.string().min(16),
}).strict();

export const ReviewCreateSchema = z.object({
  orderId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
}).strict();

export const ConsentCreateSchema = z.object({
  type: z.enum(['terms', 'privacy', 'marketing_sms', 'marketing_push', 'marketing_email']),
  granted: z.boolean(),
  source: z.string().min(1).max(50).default('mobile_app'),
  version: z.string().min(1).max(20).default('v1.0'),
}).strict();

export const AdminPatchMenuItemSchema = z.object({
  priceKurus: z.number().int().nonnegative().optional(),
  isAvailable: z.boolean().optional(),
  allergens: z.array(z.enum(VALID_ALLERGENS)).optional(),
}).strict();

export const TranslationEntrySchema = z.object({
  language: z.enum(SUPPORTED_LANGUAGES),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(1000).optional(),
}).strict();

export const AdminCreateCategorySchema = z.object({
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  translations: z.array(TranslationEntrySchema).min(1),
}).strict();

export const AdminUpdateCategorySchema = z.object({
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  translations: z.array(TranslationEntrySchema).optional(),
}).strict();

export const AdminCreateMenuItemSchema = z.object({
  categoryId: z.string().uuid(),
  priceKurus: z.number().int().nonnegative(),
  vatRatePercent: z.number().int().min(0).max(100).default(1),
  imageUrl: z.string().max(500).optional(),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  allergens: z.array(z.enum(VALID_ALLERGENS)).default([]),
  translations: z.array(TranslationEntrySchema).min(1),
}).strict();

export const AdminCreateCouponSchema = z.object({
  code: z.string().trim().min(3).max(40),
  type: z.enum(['percent', 'fixed_amount', 'free_item']),
  value: z.number().int().positive(),
  maxDiscountKurus: z.number().int().nonnegative().nullable().optional(),
  minOrderKurus: z.number().int().nonnegative().default(0),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  maxTotalUses: z.number().int().positive().nullable().optional(),
  maxUsesPerUser: z.number().int().positive().default(1),
  firstOrderOnly: z.boolean().default(false),
  appliesTo: z.enum(['all', 'categories', 'items']).default('all'),
  isActive: z.boolean().default(true),
}).strict();

export const AdminUpdateCouponSchema = z.object({
  isActive: z.boolean().optional(),
  minOrderKurus: z.number().int().nonnegative().optional(),
  maxTotalUses: z.number().int().positive().nullable().optional(),
  endsAt: z.string().datetime().optional(),
}).strict();

export const AdminUpdateZoneSchema = z.object({
  minOrderKurus: z.number().int().nonnegative().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
}).strict();

export const AdminCreateDriverSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(PHONE_E164_REGEX),
}).strict();

export const AdminCreateBannerSchema = z.object({
  imageUrl: z.string().min(3).max(500),
  titleTranslations: z.record(z.string()),
  targetType: z.enum(['category', 'menu_item', 'coupon', 'url', 'none']),
  targetId: z.string().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
}).strict();

export const AdminUpdateSettingsSchema = z.object({
  isAcceptingOrders: z.boolean().optional(),
  codMaxAmountKurus: z.number().int().nonnegative().optional(),
  codMaxOpenOrders: z.number().int().nonnegative().optional(),
  paymentTimeoutMinutes: z.number().int().positive().optional(),
  heartbeatGraceSeconds: z.number().int().positive().optional(),
}).strict();

export const AdminCreateZoneSchema = z.object({
  name: z.string().trim().min(2).max(100),
  polygonWkt: z.string().trim().min(10),
  minOrderKurus: z.number().int().nonnegative(),
  deliveryFeeKurus: z.number().int().nonnegative(),
  estimatedMinutes: z.number().int().positive().optional(),
}).strict();

export const AdminUpdateDriverSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().regex(PHONE_E164_REGEX).optional(),
  isActive: z.boolean().optional(),
}).strict();

export const AdminCreateStaffSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(['staff', 'owner']),
  password: z.string().min(8),
}).strict();

export const AdminUpdateStaffSchema = z.object({
  role: z.enum(['staff', 'owner']).optional(),
  isActive: z.boolean().optional(),
}).strict();

export const StaffRefreshTokenBodySchema = z.object({
  refreshToken: z.string().min(10),
}).strict();

export const OrderSearchQuerySchema = z.object({
  query: z.string().trim().min(1).max(100),
}).strict();

