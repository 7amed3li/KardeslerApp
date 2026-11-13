import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  timestamp,
  jsonb,
  time,
  inet,
  customType,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

export const geographyPoint = customType<{ data: string }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
});

export const geographyPolygon = customType<{ data: string }>({
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

export const userIdentities = pgTable(
  'user_identities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    provider: text('provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
    emailAtLink: citext('email_at_link'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uq_user_identities_provider_subject').on(t.provider, t.providerSubject),
    uniqueIndex('uq_user_identities_user_provider').on(t.userId, t.provider),
  ],
);

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

