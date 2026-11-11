import { describe, it, expect, vi } from 'vitest';
import { AuthorizationPolicy } from '../src/application/policies/authorization.policy.js';
import { BackgroundJobsUseCases } from '../src/application/jobs/jobs.use-cases.js';
import { LoyaltyUseCases } from '../src/application/loyalty/loyalty.use-cases.js';
import { OrdersUseCases } from '../src/application/orders/orders.use-cases.js';
import { AuthUseCases } from '../src/application/auth/auth.use-cases.js';
import { AdminUseCases } from '../src/application/admin/admin.use-cases.js';
import { MenuAndDeliveryUseCases } from '../src/application/menu/menu.use-cases.js';
import { UsersAndAddressesUseCases } from '../src/application/users/users.use-cases.js';
import {
  calculateCouponDiscountKurus,
  evaluateCouponForQuote,
  isCouponActiveAt,
  type CouponRule,
} from '../src/domain/coupons/coupon.domain.js';
import { PricingDomain, type PricedMenuItem } from '../src/domain/pricing/pricing.domain.js';
import { OrderStateMachine } from '../src/domain/orders/order-state-machine.js';
import { PaymentDomain } from '../src/domain/payments/payment.domain.js';
import { DomainError } from '../src/domain/errors.js';

describe('Domain & Application Branch Coverage Suite (>=90% gate)', () => {
  const now = new Date('2026-11-11T12:00:00Z');
  const clock = { now: () => now, nowMs: () => now.getTime() };

  it('covers AuthorizationPolicy & OrderStateMachine COD + PaymentDomain edge branches', () => {
    expect(() => AuthorizationPolicy.assertCustomer({ kind: 'customer', sub: 'u1', role: 'customer' })).not.toThrow();
    expect(() => AuthorizationPolicy.assertCustomer({ kind: 'staff', sub: 's1', role: 'staff' })).toThrow(DomainError);

    expect(() => AuthorizationPolicy.assertStaffRole({ kind: 'staff', sub: 's1', role: 'owner' }, ['owner'])).not.toThrow();
    expect(() => AuthorizationPolicy.assertStaffRole({ kind: 'staff', sub: 's1', role: 'staff' }, ['owner'])).toThrow(DomainError);

    expect(() => AuthorizationPolicy.assertPrintAgent({ kind: 'print_agent', sub: 'p1', role: 'print_agent' })).not.toThrow();
    expect(() => AuthorizationPolicy.assertPrintAgent({ kind: 'customer', sub: 'u1', role: 'customer' })).toThrow(DomainError);

    expect(() => AuthorizationPolicy.assertOwnership('u1', 'u1')).not.toThrow();
    expect(() => AuthorizationPolicy.assertOwnership('u1', null)).toThrow(DomainError);
    expect(() => AuthorizationPolicy.assertOwnership('u1', 'u2')).toThrow(DomainError);

    OrderStateMachine.assertCodEligibility({
      paymentMethod: 'card_online', totalKurus: 9999999, maxAmountKurus: 1000, openCodOrdersCount: 5, maxOpenCodOrders: 1,
    });
    OrderStateMachine.assertCodEligibility({
      paymentMethod: 'cash_on_delivery', totalKurus: 10000, maxAmountKurus: 50000, openCodOrdersCount: 0, maxOpenCodOrders: 1,
    });
    expect(() =>
      OrderStateMachine.assertCodEligibility({
        paymentMethod: 'cash_on_delivery', totalKurus: 60000, maxAmountKurus: 50000, openCodOrdersCount: 0, maxOpenCodOrders: 1,
      }),
    ).toThrow(DomainError);
    expect(() =>
      OrderStateMachine.assertCodEligibility({
        paymentMethod: 'cash_on_delivery', totalKurus: 10000, maxAmountKurus: 50000, openCodOrdersCount: 1, maxOpenCodOrders: 1,
      }),
    ).toThrow(DomainError);

    expect(PaymentDomain.decideWebhookOutcome({ orderStatus: 'awaiting_payment', expectedTotalKurus: 10000, receivedAmountKurus: 10000, webhookStatus: 'failed' })).toEqual({
      action: 'mark_failed',
      nextOrderStatus: 'awaiting_payment',
    });
    expect(PaymentDomain.shouldAutoRefund('card_online', 'paid')).toBe(true);
    expect(PaymentDomain.shouldAutoRefund('cash_on_delivery', 'paid')).toBe(false);
  });

  it('covers CouponDomain and PricingDomain validation & boundary branches', () => {
    const baseCoupon: CouponRule = {
      id: 'c1', code: 'TEST', type: 'percent', value: 20, maxDiscountKurus: 5000, minOrderKurus: 10000,
      startsAt: new Date('2026-01-01T00:00:00Z'), endsAt: new Date('2027-01-01T00:00:00Z'), isActive: true,
      usedCount: 0, maxTotalUses: 5, maxUsesPerUser: 2, firstOrderOnly: false, appliesTo: 'all',
    };

    expect(isCouponActiveAt({ ...baseCoupon, isActive: false }, now)).toBe(false);
    expect(isCouponActiveAt({ ...baseCoupon, endsAt: new Date('2026-01-02T00:00:00Z') }, now)).toBe(false);
    expect(isCouponActiveAt({ ...baseCoupon, activeHours: { start: '00:00', end: '00:01' } }, now)).toBe(false);
    expect(calculateCouponDiscountKurus(baseCoupon, 0)).toBe(0);
    expect(calculateCouponDiscountKurus({ ...baseCoupon, type: 'free_item' }, 20000)).toBe(0);
    expect(calculateCouponDiscountKurus({ ...baseCoupon, type: 'fixed_amount', value: 3000 }, 20000)).toBe(3000);
    expect(calculateCouponDiscountKurus({ ...baseCoupon, maxDiscountKurus: null }, 20000)).toBe(4000);

    const baseCtx = { subtotalKurus: 30000, now, userRedemptionsCount: 0, userDeliveredOrdersCount: 0, cartItems: [{ menuItemId: 'm1', categoryId: 'cat1' }] };
    expect(evaluateCouponForQuote(null, baseCtx, false)).toBeNull();
    expect(() => evaluateCouponForQuote(null, baseCtx, true)).toThrow(DomainError);
    expect(evaluateCouponForQuote({ ...baseCoupon, isActive: false }, baseCtx, false)).toBeNull();
    expect(() => evaluateCouponForQuote({ ...baseCoupon, usedCount: 5 }, baseCtx, true)).toThrow(DomainError);
    expect(() => evaluateCouponForQuote({ ...baseCoupon, maxUsesPerUser: 1 }, { ...baseCtx, userRedemptionsCount: 1 }, true)).toThrow(DomainError);
    expect(() => evaluateCouponForQuote({ ...baseCoupon, firstOrderOnly: true }, { ...baseCtx, userDeliveredOrdersCount: 1 }, true)).toThrow(DomainError);
    expect(() => evaluateCouponForQuote({ ...baseCoupon, minOrderKurus: 50000 }, baseCtx, true)).toThrow(DomainError);
    expect(() => evaluateCouponForQuote({ ...baseCoupon, appliesTo: 'categories', targetCategoryIds: ['other'] }, baseCtx, true)).toThrow(DomainError);
    expect(() => evaluateCouponForQuote({ ...baseCoupon, appliesTo: 'items', targetMenuItemIds: ['other'] }, baseCtx, true)).toThrow(DomainError);

    const menuMap = new Map<string, PricedMenuItem>([
      ['m1', {
        id: 'm1', categoryId: 'cat1', name: 'Kebap', priceKurus: 30000, vatRatePercent: 10, isAvailable: true,
        optionGroups: [{ id: 'g1', isRequired: true, minSelect: 1, maxSelect: 1, isActive: true }],
        options: [
          { id: 'o1', groupId: 'g1', name: 'Az Acılı', priceDeltaKurus: 0, isAvailable: true },
          { id: 'o2', groupId: 'g1', name: 'Yok', priceDeltaKurus: 0, isAvailable: false },
        ],
      }],
      ['m_off', { id: 'm_off', categoryId: 'cat1', name: 'Off', priceKurus: 1000, vatRatePercent: 10, isAvailable: false, optionGroups: [], options: [] }],
    ]);

    const qInput = { items: [{ menuItemId: 'm1', quantity: 1, optionIds: ['o1'] }], orderType: 'pickup' as const, now };
    expect(() => PricingDomain.calculateQuote({ input: qInput, menuMap, isRestaurantOpen: true, isAcceptingOrders: false })).toThrow(DomainError);
    expect(() => PricingDomain.calculateQuote({ input: qInput, menuMap, isRestaurantOpen: false, isAcceptingOrders: true })).toThrow(DomainError);
    expect(() => PricingDomain.calculateQuote({ input: { ...qInput, items: [{ menuItemId: 'missing', quantity: 1, optionIds: [] }] }, menuMap, isRestaurantOpen: true, isAcceptingOrders: true })).toThrow(DomainError);
    expect(() => PricingDomain.calculateQuote({ input: { ...qInput, items: [{ menuItemId: 'm_off', quantity: 1, optionIds: [] }] }, menuMap, isRestaurantOpen: true, isAcceptingOrders: true })).toThrow(DomainError);
    expect(() => PricingDomain.calculateQuote({ input: { ...qInput, items: [{ menuItemId: 'm1', quantity: 0, optionIds: ['o1'] }] }, menuMap, isRestaurantOpen: true, isAcceptingOrders: true })).toThrow(DomainError);
    expect(() => PricingDomain.calculateQuote({ input: { ...qInput, items: [{ menuItemId: 'm1', quantity: 1, optionIds: ['bad'] }] }, menuMap, isRestaurantOpen: true, isAcceptingOrders: true })).toThrow(DomainError);
    expect(() => PricingDomain.calculateQuote({ input: { ...qInput, items: [{ menuItemId: 'm1', quantity: 1, optionIds: ['o2'] }] }, menuMap, isRestaurantOpen: true, isAcceptingOrders: true })).toThrow(DomainError);
    expect(() => PricingDomain.calculateQuote({ input: { ...qInput, items: [{ menuItemId: 'm1', quantity: 1, optionIds: [] }] }, menuMap, isRestaurantOpen: true, isAcceptingOrders: true })).toThrow(DomainError);
  });

  it('covers BackgroundJobsUseCases, LoyaltyUseCases, OrdersUseCases refunds & AuthUseCases error branches', async () => {
    const publish = vi.fn().mockResolvedValue('evt-1');
    const jobsRepo: any = {
      expireUnpaidCardOrders: vi.fn().mockResolvedValue({ expiredCount: 1, orderIds: ['o1'] }),
      findUnacceptedOrdersPastThreshold: vi.fn().mockResolvedValue([{ id: 'o1', orderNumber: 1001 }]),
      reconcileStalePendingPayments: vi.fn().mockResolvedValue(2),
      cleanupExpiredAuthRecords: vi.fn().mockResolvedValue({ deletedOtps: 1, deletedRefreshTokens: 2 }),
      listFailedNotifications: vi.fn().mockResolvedValue([
        { id: 'n1', pushToken: 'pt1', title: 'Hi', body: 'Body', data: {} },
        { id: 'n2', pushToken: 'pt2', title: 'Hi', body: 'Fail', data: null },
      ]),
      markNotificationRetryResult: vi.fn().mockResolvedValue(undefined),
    };
    const push: any = {
      send: vi.fn()
        .mockResolvedValueOnce({ ticketId: 't1' })
        .mockRejectedValueOnce(new Error('Expo unreachable')),
    };
    const jobsUc = new BackgroundJobsUseCases(jobsRepo, { publish, subscribe: vi.fn() } as any, push, clock);
    expect((await jobsUc.checkUnacceptedOrdersAlert()).alertedOrderIds).toEqual(['o1']);
    expect((await jobsUc.retryFailedNotifications()).retriedCount).toBe(1);
    expect(jobsRepo.markNotificationRetryResult).toHaveBeenCalledWith('n2', false, 'Expo unreachable', now);

    const loyaltyUc = new LoyaltyUseCases({
      getCustomerLoyalty: vi.fn(),
      createReview: vi.fn().mockResolvedValueOnce({ error: 'not_found' }).mockResolvedValueOnce({ error: 'not_delivered' }),
      recordConsent: vi.fn(),
    });
    await expect(loyaltyUc.createReview('u1', { orderId: 'o1', rating: 5 })).rejects.toMatchObject({ statusCode: 404 });
    await expect(loyaltyUc.createReview('u1', { orderId: 'o1', rating: 5 })).rejects.toMatchObject({ statusCode: 422 });

    const paymentRepo: any = { markOrderRefundSucceeded: vi.fn().mockResolvedValue(true), recordWebhookAndMaybeMarkPaid: vi.fn() };
    const paymentProvider: any = { createHostedCheckout: vi.fn(), refundPayment: vi.fn().mockResolvedValue({ refundRef: 'ref-1' }) };
    const ordersRepo: any = {
      cancelCustomerOrder: vi.fn().mockResolvedValue({ order: { id: 'o1', totalKurus: 10000, status: 'cancelled' }, wasPaidCard: true }),
      transitionOrderAsStaff: vi.fn().mockResolvedValue({
        order: { id: 'o2', orderNumber: 10, status: 'rejected' },
        shouldRefundPaidCard: true,
        paymentProviderRef: 'prov-1',
        paymentAmountKurus: 15000,
      }),
    };
    const ordersUc = new OrdersUseCases({
      ordersRepo: {
        ...ordersRepo,
        buildReorderPreview: vi.fn().mockResolvedValue(null),
        assignDriver: vi.fn().mockResolvedValue(null),
      },
      menuRepo: {} as any, deliveryRepo: {} as any, couponRepo: {} as any,
      paymentRepo, paymentProvider, eventBus: { publish, subscribe: vi.fn() } as any,
      idGen: { uuid: () => 'u' }, clock,
    } as any);
    expect((await ordersUc.cancelCustomerOrder('u1', 'o1')).refunded).toBe(true);
    await ordersUc.transitionOrderAsStaff('s1', 'staff', 'o2', 'rejected', 'No stock');
    await expect(ordersUc.reorderPreview('u1', 'o1')).rejects.toMatchObject({ statusCode: 404 });
    await expect(ordersUc.assignDriver('s1', 'staff', 'o1', 'd1')).rejects.toMatchObject({ statusCode: 404 });
    expect(paymentProvider.refundPayment).toHaveBeenCalledTimes(2);
    expect(paymentRepo.markOrderRefundSucceeded).toHaveBeenCalledTimes(2);

    const authRepo: any = {
      getLatestUnconsumedOtp: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'otp1', attempts: 5, expiresAt: new Date(now.getTime() + 60000), salt: 's', codeHash: 'h' })
        .mockResolvedValueOnce({ id: 'otp2', attempts: 0, expiresAt: new Date(now.getTime() + 60000), salt: 's', codeHash: 'h' }),
      incrementOtpAttempt: vi.fn().mockResolvedValue(undefined),
      getStaffByEmailForAuth: vi.fn().mockResolvedValue({
        id: 's1', email: 'a@b.c', passwordHash: 'h', role: 'staff', totpEnabled: true, totpSecretEncrypted: 'enc', isActive: true,
      }),
      enableStaffTotp: vi.fn().mockResolvedValue(null),
    };
    const cryptoSvc: any = {
      hashOtp: () => 'cand',
      verifyOtpHash: () => false,
      hashRefreshToken: () => 'h',
      verifyPassword: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockResolvedValueOnce(true),
      decryptTotpSecret: () => 'sec',
      verifyTotpCode: vi.fn().mockReturnValue(false),
    };
    const tokens: any = { verifyStaffTotpSetupToken: vi.fn().mockResolvedValue({ sub: 's1' }), signStaffToken: vi.fn() };
    const authUc = new AuthUseCases({
      repo: authRepo, crypto: cryptoSvc, tokens, sms: {} as any,
      rateLimiter: { check: vi.fn(), checkSmsCircuitBreaker: vi.fn(), resetAll: vi.fn() }, revokedTokens: {} as any,
      ids: { uuid: () => 'u', randomDigits6: () => '123456', randomHex: () => 'x' }, clock,
      allowReviewDemoOtp: false, reviewDemoPhone: '', reviewDemoCode: '', isTestEnv: true,
    });
    await expect(authUc.verifyCustomerOtp('+905331112233', '000000', '1.2.3.4')).rejects.toMatchObject({ statusCode: 401 });
    await expect(authUc.verifyCustomerOtp('+905331112233', '000000', '1.2.3.4')).rejects.toMatchObject({ statusCode: 401 });
    await expect(authUc.verifyCustomerOtp('+905331112233', '000000', '1.2.3.4')).rejects.toMatchObject({ statusCode: 401 });
    await expect(authUc.loginStaff('a@b.c', 'wrong')).rejects.toMatchObject({ statusCode: 401 });
    await expect(authUc.loginStaff('a@b.c', 'ok')).rejects.toMatchObject({ statusCode: 401 });
    await expect(authUc.loginStaff('a@b.c', 'ok', '999999')).rejects.toMatchObject({ statusCode: 401 });
    await expect(authUc.verifySetupStaffTotp('st', 'sec', '000000')).rejects.toMatchObject({ statusCode: 400 });

    // 404 paths in Admin / Menu / Users use-cases + menu cache hit
    const adminUc = new AdminUseCases(
      { resolveFraudFlag: vi.fn().mockResolvedValue(null) } as any,
      { updateAdminCoupon: vi.fn().mockResolvedValue(null) } as any,
      { updateZoneAdmin: vi.fn().mockResolvedValue(null) } as any,
      {} as any, clock,
    );
    await expect(adminUc.updateCoupon('s1', 'c1', {})).rejects.toMatchObject({ statusCode: 404 });
    await expect(adminUc.updateZone('s1', 'z1', {})).rejects.toMatchObject({ statusCode: 404 });
    await expect(adminUc.resolveFraudFlag('s1', 'f1')).rejects.toMatchObject({ statusCode: 404 });

    const menuUc = new MenuAndDeliveryUseCases(
      { updateItem: vi.fn().mockResolvedValue(null), updateCategory: vi.fn().mockResolvedValue(null), softDeleteMenuItem: vi.fn().mockResolvedValue(false) } as any,
      {} as any, {} as any,
      { get: vi.fn().mockResolvedValue({ cached: true }), set: vi.fn(), deleteByPrefix: vi.fn() },
    );
    expect(await menuUc.getLocalizedMenu('tr')).toEqual({ cached: true });
    await expect(menuUc.updateMenuItem('s1', 'm1', {})).rejects.toMatchObject({ statusCode: 404 });
    await expect(menuUc.updateCategory('s1', 'c1', {})).rejects.toMatchObject({ statusCode: 404 });
    await expect(menuUc.deleteMenuItem('s1', 'm1')).rejects.toMatchObject({ statusCode: 404 });

    const usersUc = new UsersAndAddressesUseCases(
      {} as any,
      { softDeleteForCustomer: vi.fn().mockResolvedValue(false) } as any,
    );
    await expect(usersUc.deleteAddress('u1', 'a1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

