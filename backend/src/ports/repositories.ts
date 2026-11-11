import type { SupportedLanguage, OrderStatus } from '@kardesler/shared';
import type { CouponRule } from '../domain/coupons/coupon.domain.js';
import type { PricedMenuItem, DeliveryZoneRule } from '../domain/pricing/pricing.domain.js';
import type { ZoneCoverageResult } from '../domain/delivery/delivery.domain.js';

export interface DbPostureReport {
  api: { roleName: string; isSuperuser: boolean; bypassRls: boolean; ownedPublicTables: number };
  readonly: { roleName: string; isSuperuser: boolean; bypassRls: boolean; ownedPublicTables: number };
}

export interface DbHealthPort {
  verifyPosture(): Promise<DbPostureReport>;
}

export interface OtpRecord {
  id: string;
  phone: string;
  salt: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
}

export interface UserProfile {
  id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  preferredLanguage: string;
  referralCode: string;
  isBlocked: boolean;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string | null;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  deviceInfo: string | null;
}

export interface StaffAuthRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: 'owner' | 'staff';
  totpSecretEncrypted: string | null;
  totpEnabled: boolean;
  isActive: boolean;
}

export interface AuthRepository {
  getLatestUnconsumedOtp(phone: string): Promise<OtpRecord | null>;
  createOtp(input: { phone: string; salt: string; codeHash: string; expiresAt: Date; ip: string | null }): Promise<void>;
  incrementOtpAttempt(otpId: string, nextAttempts: number): Promise<void>;
  verifyOtpAndIssueSession(input: {
    otpId: string;
    phone: string;
    newReferralCode: string;
    refreshTokenHash: string;
    familyId: string;
    refreshExpiresAt: Date;
    deviceInfo: string | null;
    now: Date;
  }): Promise<{ user: UserProfile }>;
  rotateRefreshTokenTx(input: {
    tokenHash: string;
    newTokenHash: string;
    newExpiresAt: Date;
    deviceInfo: string | null;
    now: Date;
  }): Promise<{ status: 'ok'; userId: string } | { status: 'reused' } | { status: 'not_found' } | { status: 'expired' }>;
  revokeCustomerRefreshTokens(userId: string, tokenHash?: string): Promise<void>;
  getStaffByEmailForAuth(email: string): Promise<StaffAuthRecord | null>;
  touchStaffLogin(staffId: string, now: Date): Promise<void>;
  enableStaffTotp(staffId: string, encryptedSecret: string, now: Date): Promise<{ id: string; email: string; role: 'owner' | 'staff' } | null>;
}

export interface UserRepository {
  anonymizeCustomer(userId: string): Promise<void>;
  updateCustomerProfile(userId: string, input: { name?: string; email?: string | null; preferredLanguage?: SupportedLanguage }): Promise<UserProfile>;
  registerDevice(userId: string, input: { pushToken: string; platform: string; appVersion: string }): Promise<{ id: string; pushToken: string; platform: string }>;
  getReferralSummary(userId: string): Promise<{ referralCode: string; referrals: unknown[] }>;
}

export interface AddressRecord {
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

export interface AddressRepository {
  listForCustomer(userId: string): Promise<AddressRecord[]>;
  createForCustomer(userId: string, input: Omit<AddressRecord, 'id'>): Promise<AddressRecord>;
  updateForCustomer(userId: string, addressId: string, input: Partial<Omit<AddressRecord, 'id'>>): Promise<AddressRecord | null>;
  softDeleteForCustomer(userId: string, addressId: string): Promise<boolean>;
}

export interface MenuRepository {
  getLocalizedMenu(lang: SupportedLanguage): Promise<{ language: SupportedLanguage; categories: unknown[]; items: unknown[] }>;
  getPricingSnapshot(): Promise<{ items: Map<string, PricedMenuItem>; isAcceptingOrders: boolean; openingHours: unknown }>;
  updateItem(id: string, staffId: string, patch: { priceKurus?: number; isAvailable?: boolean; allergens?: string[] }): Promise<unknown | null>;
  createCategory(staffId: string, input: { sortOrder: number; isActive: boolean; translations: { language: SupportedLanguage; name: string; description?: string }[] }): Promise<unknown>;
  updateCategory(staffId: string, id: string, patch: { sortOrder?: number; isActive?: boolean; translations?: { language: SupportedLanguage; name: string; description?: string }[] }): Promise<unknown | null>;
  createMenuItem(staffId: string, input: { categoryId: string; priceKurus: number; vatRatePercent: number; imageUrl?: string; isAvailable: boolean; sortOrder: number; allergens: string[]; translations: { language: SupportedLanguage; name: string; description?: string }[] }): Promise<unknown>;
  softDeleteMenuItem(staffId: string, id: string): Promise<boolean>;
  listPublicBanners(): Promise<unknown[]>;
}

export interface DeliveryRepository {
  findZoneAtPoint(lat: number, lng: number): Promise<ZoneCoverageResult['zone']>;
  findZoneRuleAtPoint(lat: number, lng: number): Promise<DeliveryZoneRule | null>;
  listZonesAdmin(staffId: string): Promise<unknown[]>;
  updateZoneAdmin(staffId: string, id: string, patch: { minOrderKurus?: number; estimatedMinutes?: number; isActive?: boolean }): Promise<unknown | null>;
}

export interface CouponRepository {
  findByCode(code: string): Promise<CouponRule | null>;
  getUserUsageStats(userId: string, couponId: string): Promise<{ redemptionsCount: number; deliveredOrdersCount: number }>;
  listAdminCoupons(staffId: string): Promise<unknown[]>;
  createAdminCoupon(staffId: string, input: Record<string, unknown>): Promise<unknown>;
  updateAdminCoupon(staffId: string, id: string, patch: Record<string, unknown>): Promise<unknown | null>;
}

export interface OrderSummaryRecord {
  id: string;
  userId: string | null;
  orderNumber: number;
  businessDate: string;
  orderType: 'delivery' | 'pickup';
  status: OrderStatus;
  subtotalKurus: number;
  discountKurus: number;
  deliveryFeeKurus: number;
  totalKurus: number;
  paymentMethod: 'card_online' | 'cash_on_delivery';
  customerNameSnapshot: string;
  customerPhoneSnapshot: string;
  addressSnapshot: unknown;
  customerNote: string | null;
  createdAt: Date;
}

export interface OrderRepository {
  createViaStoredFn(userId: string, input: {
    orderType: 'delivery' | 'pickup';
    paymentMethod: 'card_online' | 'cash_on_delivery';
    idempotencyKey: string;
    items: { menu_item_id: string; quantity: number; option_ids: string[] }[];
    addressId?: string;
    addressSnapshot?: unknown;
    couponCode?: string;
    customerNote?: string;
  }): Promise<OrderSummaryRecord>;
  listCustomerOrders(userId: string): Promise<unknown[]>;
  getCustomerOrderDetail(userId: string, orderId: string): Promise<{ order: unknown; items: unknown[]; events: unknown[] } | null>;
  cancelCustomerOrder(userId: string, orderId: string, reason: string): Promise<{ order: OrderSummaryRecord; wasPaidCard: boolean }>;
  buildReorderPreview(userId: string, orderId: string): Promise<unknown | null>;
  listStaffOrders(staffId: string, role: 'staff' | 'owner'): Promise<unknown[]>;
  transitionOrderAsStaff(params: {
    staffId: string;
    role: 'staff' | 'owner';
    orderId: string;
    toStatus: OrderStatus;
    cancelReason?: string;
    loyaltyKurusPerPoint: number;
    referrerBonus: number;
    referredBonus: number;
    now: Date;
  }): Promise<{ order: OrderSummaryRecord; shouldRefundPaidCard: boolean; paymentProviderRef: string | null; paymentAmountKurus: number }>;
  assignDriver(staffId: string, role: 'staff' | 'owner', orderId: string, driverId: string): Promise<unknown | null>;
  createReprintJob(staffId: string, role: 'staff' | 'owner', orderId: string): Promise<unknown>;
}

export interface PaymentRepository {
  processWebhookEvent(params: {
    providerName: string;
    providerEventId: string;
    orderId: string;
    amountKurus: number;
    status: 'paid' | 'failed';
    providerRef: string;
    rawPayload: Record<string, unknown>;
    now: Date;
  }): Promise<
    | { outcome: 'idempotent_replay' }
    | { outcome: 'not_found' }
    | { outcome: 'amount_mismatch' }
    | { outcome: 'activated' }
    | { outcome: 'failed'; orderStatus: string }
  >;
  markOrderRefundSucceeded(params: {
    orderId: string;
    reason: string;
    initiatedBy: string;
    refundRef: string;
    now: Date;
  }): Promise<boolean>;
}

export interface LoyaltyRepository {
  getCustomerLoyalty(userId: string): Promise<{ currentBalance: number; activeBalance: number; ledger: unknown[] }>;
  createReview(userId: string, input: { orderId: string; rating: number; comment?: string }): Promise<unknown>;
  recordConsent(userId: string, input: { type: string; granted: boolean; source: string; version: string }): Promise<unknown>;
}

export interface PrintRepository {
  recordHeartbeatAndPollPending(deviceId: string, now: Date): Promise<{
    jobId: string;
    orderId: string;
    orderNumber: number;
    businessDate: string;
    orderType: 'delivery' | 'pickup';
    paymentMethod: 'card_online' | 'cash_on_delivery';
    customerName: string;
    customerPhone: string;
    addressText: string | null;
    customerNote: string | null;
    kind: string;
    items: {
      quantity: number;
      nameTr: string;
      unitPriceKurus: number;
      lineTotalKurus: number;
      options: { nameTr: string; priceDeltaKurus: number }[];
    }[];
    subtotalKurus: number;
    discountKurus: number;
    totalKurus: number;
    createdAt: Date;
  }[]>;
  ackPrintJob(jobId: string, input: { status: 'printed' | 'failed'; error?: string; now: Date }): Promise<unknown | null>;
}

export interface SettingsRepository {
  getPublicSettingsWithHeartbeats(): Promise<{
    name: string;
    phone: string;
    address: string;
    currency: string;
    minAppVersion: string;
    openingHours: unknown;
    codMaxAmountKurus: number;
    isAcceptingOrders: boolean;
    heartbeatAlive: boolean;
    orderingAvailable: boolean;
  }>;
  setAcceptingOrders(staffId: string, role: 'staff' | 'owner', isAcceptingOrders: boolean): Promise<{ isAcceptingOrders: boolean }>;
  recordHeartbeat(staffId: string, role: 'staff' | 'owner', input: { deviceId: string; kind: 'print_agent' | 'staff_tablet'; meta: Record<string, unknown>; now: Date }): Promise<void>;
}

export interface AdminRepository {
  getDailySummary(staffId: string, businessDate?: string): Promise<unknown>;
  getAuditLogs(staffId: string): Promise<unknown[]>;
  listDrivers(staffId: string): Promise<unknown[]>;
  createDriver(staffId: string, input: { name: string; phone: string; vehiclePlate?: string }): Promise<unknown>;
  listStaff(staffId: string): Promise<unknown[]>;
  listFraudFlags(staffId: string): Promise<unknown[]>;
  resolveFraudFlag(staffId: string, flagId: string, now: Date): Promise<unknown | null>;
  listBanners(staffId: string): Promise<unknown[]>;
  createBanner(staffId: string, input: Record<string, unknown>): Promise<unknown>;
  updateSettings(staffId: string, patch: Record<string, unknown>): Promise<unknown>;
}

export interface BackgroundJobRepository {
  expireUnpaidCardOrders(): Promise<{ expiredCount: number; orderIds: string[] }>;
  findUnacceptedOrdersPastThreshold(): Promise<{ id: string; orderNumber: number }[]>;
  cleanupExpiredAuthRecords(): Promise<{ deletedOtps: number; deletedRefreshTokens: number }>;
  reconcileStalePendingPayments(): Promise<number>;
  listFailedNotifications(limit?: number): Promise<{ id: string; pushToken: string; title: string; body: string; data: unknown }[]>;
  markNotificationRetryResult(id: string, success: boolean, ticketIdOrReason: string, now: Date): Promise<void>;
}
