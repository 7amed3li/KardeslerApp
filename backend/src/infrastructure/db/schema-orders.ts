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
  primaryKey,
} from 'drizzle-orm/pg-core';
import { citext, deliveryZones, devices, drivers, staffUsers, users } from './schema-core.js';
import { categories, menuItems, options } from './schema-menu.js';

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
