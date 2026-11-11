import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  timestamp,
  jsonb,
  date,
  time,
  inet,
  primaryKey,
  customType,
} from 'drizzle-orm/pg-core';

const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

const geographyPoint = customType<{ data: string }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
});

const geographyPolygon = customType<{ data: string }>({
  dataType() {
    return 'geography(Polygon, 4326)';
  },
});

export const restaurantSettings = pgTable('restaurant_settings', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  address: text('address').notNull(),
  isAcceptingOrders: boolean('is_accepting_orders').default(true).notNull(),
  openingHours: jsonb('opening_hours').notNull(),
  businessDayCutoff: time('business_day_cutoff').default('06:00:00').notNull(),
  minAppVersion: text('min_app_version').default('1.0.0').notNull(),
  currency: text('currency').default('TRY').notNull(),
  codMaxAmountKurus: bigint('cod_max_amount_kurus', { mode: 'number' }).default(150000).notNull(),
  codMaxOpenOrders: integer('cod_max_open_orders').default(1).notNull(),
  paymentTimeoutMinutes: integer('payment_timeout_minutes').default(15).notNull(),
  unacceptedOrderAlertMinutes: integer('unaccepted_order_alert_minutes').default(5).notNull(),
  heartbeatGraceSeconds: integer('heartbeat_grace_seconds').default(120).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const staffUsers = pgTable('staff_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: citext('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(),
  totpSecretEncrypted: text('totp_secret_encrypted'),
  totpEnabled: boolean('totp_enabled').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: text('phone'),
  name: text('name'),
  email: citext('email'),
  preferredLanguage: text('preferred_language').default('tr').notNull(),
  referralCode: text('referral_code').unique().notNull(),
  referredByUserId: uuid('referred_by_user_id'),
  isBlocked: boolean('is_blocked').default(false).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const otpCodes = pgTable('otp_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: text('phone').notNull(),
  salt: text('salt').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').default(0).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  ip: inet('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  staffUserId: uuid('staff_user_id').references(() => staffUsers.id),
  tokenHash: text('token_hash').unique().notNull(),
  familyId: uuid('family_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  replacedById: uuid('replaced_by_id'),
  deviceInfo: text('device_info'),
  ip: inet('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const devices = pgTable('devices', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  pushToken: text('push_token').unique().notNull(),
  platform: text('platform').notNull(),
  appVersion: text('app_version').notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const addresses = pgTable('addresses', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  label: text('label').notNull(),
  fullAddress: text('full_address').notNull(),
  location: geographyPoint('location').notNull(),
  building: text('building'),
  floor: text('floor'),
  apartment: text('apartment'),
  notes: text('notes'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const consents = pgTable('consents', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  type: text('type').notNull(),
  granted: boolean('granted').notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  source: text('source').notNull(),
  version: text('version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const deliveryZones = pgTable('delivery_zones', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  area: geographyPolygon('area').notNull(),
  minOrderKurus: bigint('min_order_kurus', { mode: 'number' }).notNull(),
  deliveryFeeKurus: bigint('delivery_fee_kurus', { mode: 'number' }).default(0).notNull(),
  estimatedMinutes: integer('estimated_minutes').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const drivers = pgTable('drivers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorStaffId: uuid('actor_staff_id').references(() => staffUsers.id),
  action: text('action').notNull(),
  tableName: text('table_name').notNull(),
  recordId: text('record_id').notNull(),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  ip: inet('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const categoryTranslations = pgTable('category_translations', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryId: uuid('category_id').references(() => categories.id).notNull(),
  language: text('language').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const menuItems = pgTable('menu_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryId: uuid('category_id').references(() => categories.id).notNull(),
  priceKurus: bigint('price_kurus', { mode: 'number' }).notNull(),
  vatRatePercent: integer('vat_rate_percent').default(1).notNull(),
  imageUrl: text('image_url'),
  isAvailable: boolean('is_available').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  allergens: text('allergens').array().default([]).notNull(),
  availableFrom: time('available_from'),
  availableUntil: time('available_until'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const menuItemTranslations = pgTable('menu_item_translations', {
  id: uuid('id').defaultRandom().primaryKey(),
  menuItemId: uuid('menu_item_id').references(() => menuItems.id).notNull(),
  language: text('language').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tags = pgTable('tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').unique().notNull(),
  icon: text('icon'),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tagTranslations = pgTable('tag_translations', {
  id: uuid('id').defaultRandom().primaryKey(),
  tagId: uuid('tag_id').references(() => tags.id).notNull(),
  language: text('language').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const menuItemTags = pgTable(
  'menu_item_tags',
  {
    menuItemId: uuid('menu_item_id').references(() => menuItems.id).notNull(),
    tagId: uuid('tag_id').references(() => tags.id).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.menuItemId, t.tagId] })],
);

export const optionGroups = pgTable('option_groups', {
  id: uuid('id').defaultRandom().primaryKey(),
  menuItemId: uuid('menu_item_id').references(() => menuItems.id).notNull(),
  minSelect: integer('min_select').default(0).notNull(),
  maxSelect: integer('max_select').default(1).notNull(),
  isRequired: boolean('is_required').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const optionGroupTranslations = pgTable('option_group_translations', {
  id: uuid('id').defaultRandom().primaryKey(),
  optionGroupId: uuid('option_group_id').references(() => optionGroups.id).notNull(),
  language: text('language').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const options = pgTable('options', {
  id: uuid('id').defaultRandom().primaryKey(),
  optionGroupId: uuid('option_group_id').references(() => optionGroups.id).notNull(),
  priceDeltaKurus: bigint('price_delta_kurus', { mode: 'number' }).default(0).notNull(),
  isAvailable: boolean('is_available').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const optionTranslations = pgTable('option_translations', {
  id: uuid('id').defaultRandom().primaryKey(),
  optionId: uuid('option_id').references(() => options.id).notNull(),
  language: text('language').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const priceHistory = pgTable('price_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  menuItemId: uuid('menu_item_id').references(() => menuItems.id).notNull(),
  oldPriceKurus: bigint('old_price_kurus', { mode: 'number' }).notNull(),
  newPriceKurus: bigint('new_price_kurus', { mode: 'number' }).notNull(),
  changedByStaffId: uuid('changed_by_staff_id').references(() => staffUsers.id),
  changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow().notNull(),
});

export const dailyOrderCounters = pgTable('daily_order_counters', {
  businessDate: date('business_date').primaryKey(),
  lastOrderNumber: integer('last_order_number').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  orderType: text('order_type').notNull(),
  status: text('status').default('new').notNull(),
  businessDate: date('business_date').notNull(),
  orderNumber: integer('order_number').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  subtotalKurus: bigint('subtotal_kurus', { mode: 'number' }).notNull(),
  discountKurus: bigint('discount_kurus', { mode: 'number' }).default(0).notNull(),
  deliveryFeeKurus: bigint('delivery_fee_kurus', { mode: 'number' }).default(0).notNull(),
  totalKurus: bigint('total_kurus', { mode: 'number' }).notNull(),
  minOrderKurusApplied: bigint('min_order_kurus_applied', { mode: 'number' }).default(0).notNull(),
  addressSnapshot: jsonb('address_snapshot'),
  customerNameSnapshot: text('customer_name_snapshot').notNull(),
  customerPhoneSnapshot: text('customer_phone_snapshot').notNull(),
  customerNote: text('customer_note'),
  paymentMethod: text('payment_method').notNull(),
  deliveryZoneId: uuid('delivery_zone_id').references(() => deliveryZones.id),
  driverId: uuid('driver_id').references(() => drivers.id),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancelReason: text('cancel_reason'),
  invoiceNumber: text('invoice_number'),
  invoiceStatus: text('invoice_status').default('not_required').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => orders.id).notNull(),
  menuItemId: uuid('menu_item_id').references(() => menuItems.id).notNull(),
  nameSnapshot: text('name_snapshot').notNull(),
  unitPriceSnapshotKurus: bigint('unit_price_snapshot_kurus', { mode: 'number' }).notNull(),
  vatRateSnapshot: integer('vat_rate_snapshot').notNull(),
  quantity: integer('quantity').notNull(),
  lineTotalKurus: bigint('line_total_kurus', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const orderItemOptions = pgTable('order_item_options', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderItemId: uuid('order_item_id').references(() => orderItems.id).notNull(),
  optionId: uuid('option_id').references(() => options.id).notNull(),
  nameSnapshot: text('name_snapshot').notNull(),
  priceDeltaSnapshotKurus: bigint('price_delta_snapshot_kurus', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const orderEvents = pgTable('order_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => orders.id).notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  actorType: text('actor_type').notNull(),
  actorId: text('actor_id'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => orders.id).notNull(),
  method: text('method').notNull(),
  status: text('status').default('pending').notNull(),
  amountKurus: bigint('amount_kurus', { mode: 'number' }).notNull(),
  provider: text('provider').notNull(),
  providerRef: text('provider_ref'),
  providerEventId: text('provider_event_id').unique(),
  failureReason: text('failure_reason'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const printJobs = pgTable('print_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => orders.id).notNull(),
  kind: text('kind').default('kitchen_ticket').notNull(),
  status: text('status').default('pending').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  lastError: text('last_error'),
  printedAt: timestamp('printed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const coupons = pgTable('coupons', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: citext('code').unique().notNull(),
  type: text('type').notNull(),
  value: bigint('value', { mode: 'number' }).notNull(),
  maxDiscountKurus: bigint('max_discount_kurus', { mode: 'number' }),
  minOrderKurus: bigint('min_order_kurus', { mode: 'number' }).default(0).notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  maxTotalUses: integer('max_total_uses'),
  maxUsesPerUser: integer('max_uses_per_user').default(1).notNull(),
  firstOrderOnly: boolean('first_order_only').default(false).notNull(),
  appliesTo: text('applies_to').default('all').notNull(),
  activeHours: jsonb('active_hours'),
  isActive: boolean('is_active').default(true).notNull(),
  usedCount: integer('used_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const couponCategories = pgTable(
  'coupon_categories',
  {
    couponId: uuid('coupon_id').references(() => coupons.id).notNull(),
    categoryId: uuid('category_id').references(() => categories.id).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.couponId, t.categoryId] })],
);

export const couponMenuItems = pgTable(
  'coupon_menu_items',
  {
    couponId: uuid('coupon_id').references(() => coupons.id).notNull(),
    menuItemId: uuid('menu_item_id').references(() => menuItems.id).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.couponId, t.menuItemId] })],
);

export const couponRedemptions = pgTable('coupon_redemptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  couponId: uuid('coupon_id').references(() => coupons.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  orderId: uuid('order_id').references(() => orders.id).notNull(),
  discountKurus: bigint('discount_kurus', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const referrals = pgTable('referrals', {
  id: uuid('id').defaultRandom().primaryKey(),
  referrerUserId: uuid('referrer_user_id').references(() => users.id).notNull(),
  referredUserId: uuid('referred_user_id').references(() => users.id).unique().notNull(),
  status: text('status').default('pending').notNull(),
  orderId: uuid('order_id').references(() => orders.id),
  rewardedAt: timestamp('rewarded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const loyaltyLedger = pgTable('loyalty_ledger', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  points: integer('points').notNull(),
  reason: text('reason').notNull(),
  orderId: uuid('order_id').references(() => orders.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const banners = pgTable('banners', {
  id: uuid('id').defaultRandom().primaryKey(),
  imageUrl: text('image_url').notNull(),
  titleTranslations: jsonb('title_translations').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const reviews = pgTable('reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => orders.id).unique().notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  deviceId: uuid('device_id').references(() => devices.id),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  data: jsonb('data'),
  status: text('status').default('pending').notNull(),
  providerTicketId: text('provider_ticket_id'),
  failureReason: text('failure_reason'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const heartbeats = pgTable('heartbeats', {
  deviceId: text('device_id').primaryKey(),
  kind: text('kind').notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  meta: jsonb('meta').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const paymentEvents = pgTable('payment_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  provider: text('provider').notNull(),
  providerEventId: text('provider_event_id').unique().notNull(),
  orderId: uuid('order_id').references(() => orders.id),
  eventType: text('event_type').notNull(),
  rawPayload: jsonb('raw_payload').notNull(),
  signatureValid: boolean('signature_valid').default(true).notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const refunds = pgTable('refunds', {
  id: uuid('id').defaultRandom().primaryKey(),
  paymentId: uuid('payment_id').references(() => payments.id).notNull(),
  orderId: uuid('order_id').references(() => orders.id).notNull(),
  amountKurus: bigint('amount_kurus', { mode: 'number' }).notNull(),
  reason: text('reason').notNull(),
  status: text('status').default('pending').notNull(),
  providerRef: text('provider_ref'),
  failureReason: text('failure_reason'),
  initiatedBy: text('initiated_by'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const fraudFlags = pgTable('fraud_flags', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  orderId: uuid('order_id').references(() => orders.id),
  flagType: text('flag_type').notNull(),
  severity: text('severity').default('medium').notNull(),
  details: jsonb('details').default({}).notNull(),
  resolved: boolean('resolved').default(false).notNull(),
  resolvedBy: uuid('resolved_by').references(() => staffUsers.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
