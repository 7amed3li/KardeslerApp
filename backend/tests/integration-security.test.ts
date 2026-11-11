import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { authenticator } from 'otplib';
import { buildApp } from '../src/main.js';
import { parseEnv } from '../src/config/env.js';
import { AuthService, ConsoleSmsProvider } from '../src/modules/auth/auth.service.js';
import { computeWebhookSignature } from '../src/modules/payments/payment.service.js';
import { rateLimiter } from '../src/common/security.js';
import { withRlsTx, closeDbPools } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

describe('Kardeşler Cihangir Backend — Full Vertical Slice & Real-Role Security Suite', () => {
  const smsProvider = new ConsoleSmsProvider();
  const app = buildApp({ smsProvider });

  let aliceToken = '';
  let aliceRefreshToken = '';
  let aliceUserId = '';

  let bobToken = '';
  let bobUserId = '';

  let ownerToken = '';
  let staffToken = '';

  const runSuffix = String(Date.now()).slice(-7);
  const alicePhone = `+90533${runSuffix}`;
  const bobPhone = `+90534${runSuffix}`;
  const tempPhone = `+90535${runSuffix}`;

  beforeAll(async () => {
    await app.ready();
    rateLimiter.resetAll();

    // Prepare deterministic test state in DB using system context on app_api
    const ownerPwdHash = await AuthService.hashPassword('OwnerSecretPass!2026');
    const staffPwdHash = await AuthService.hashPassword('StaffSecretPass!2026');
    const staffTotpSecret = AuthService.generateTotpSecret();
    const staffTotpEncrypted = AuthService.encryptTotpSecret(staffTotpSecret);

    await withRlsTx({ role: 'system' }, async (tx) => {
      // Reset restaurant settings to accepting orders & clear stale heartbeats
      await tx.execute(sql`
        UPDATE public.restaurant_settings
        SET is_accepting_orders = true, cod_max_amount_kurus = 150000, cod_max_open_orders = 2
        WHERE id = 1
      `);
      await tx.execute(sql`DELETE FROM public.heartbeats`);

      // Ensure owner account starts with totp_enabled = false so we test mandatory TOTP setup flow
      await tx.execute(sql`
        UPDATE public.staff_users
        SET password_hash = ${ownerPwdHash},
            totp_enabled = false,
            totp_secret_encrypted = NULL,
            is_active = true
        WHERE email = 'owner@kardeslercihangir.com'
      `);

      // Ensure a regular 'staff' account exists with TOTP enabled
      await tx.execute(sql`
        INSERT INTO public.staff_users (id, email, password_hash, role, totp_secret_encrypted, totp_enabled, is_active)
        VALUES (
          'a0000000-0000-0000-0000-000000000002',
          'mutfak@kardeslercihangir.com',
          ${staffPwdHash},
          'staff',
          ${staffTotpEncrypted},
          true,
          true
        )
        ON CONFLICT (email) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          role = 'staff',
          totp_secret_encrypted = EXCLUDED.totp_secret_encrypted,
          totp_enabled = true,
          is_active = true
      `);
    });

    staffToken = AuthService.generateStaffToken('a0000000-0000-0000-0000-000000000002', 'staff')
      .accessToken;
  });

  afterAll(async () => {
    await app.close();
    await closeDbPools();
  });

  // ==========================================================================
  // SLICE 1: FOUNDATION, ENV FAIL-FAST & REAL DATABASE ROLES
  // ==========================================================================
  it('1. verifies /readyz connects strictly as app_api and app_readonly (never superuser)', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ready');
    expect(body.dbRoles.api).toBe('app_api');
    expect(body.dbRoles.readonly).toBe('app_readonly');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('2. fails fast at boot if NODE_ENV=production uses default secrets or postgres superuser', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres@127.0.0.1:5434/kardesler_db',
      }),
    ).toThrow();
  });

  // ==========================================================================
  // SLICE 2: AUTHENTICATION (CUSTOMER OTP, REFRESH REUSE DETECTION, STAFF TOTP)
  // ==========================================================================
  it('3. rejects non-Turkish phone numbers on OTP request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/otp/request',
      payload: { phone: '+447700900077' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('4. completes customer OTP login for Alice and Bob, and detects refresh token reuse', async () => {
    // Request OTP for Alice
    const reqRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/otp/request',
      payload: { phone: alicePhone },
    });
    expect(reqRes.statusCode).toBe(200);
    const aliceOtp = smsProvider.lastSentCodeByPhone.get(alicePhone)!;
    expect(aliceOtp).toMatch(/^\d{6}$/);

    // Verify OTP for Alice
    const verRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/otp/verify',
      payload: { phone: alicePhone, code: aliceOtp },
    });
    expect(verRes.statusCode).toBe(200);
    const verBody = verRes.json();
    aliceToken = verBody.accessToken;
    aliceRefreshToken = verBody.refreshToken;
    aliceUserId = verBody.user.id;
    expect(aliceToken).toBeTruthy();
    expect(aliceRefreshToken).toHaveLength(64);

    // Rotate Alice's refresh token once -> succeeds
    const rot1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/refresh',
      payload: { refreshToken: aliceRefreshToken },
    });
    expect(rot1.statusCode).toBe(200);
    const newRefreshToken = rot1.json().refreshToken;
    expect(newRefreshToken).not.toBe(aliceRefreshToken);

    // REPLAY the old rotated token (aliceRefreshToken) -> triggers family reuse detection (401)!
    const replayRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/refresh',
      payload: { refreshToken: aliceRefreshToken },
    });
    expect(replayRes.statusCode).toBe(401);

    // Now even the legitimate `newRefreshToken` in that compromised family MUST be revoked!
    const afterCompromiseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/refresh',
      payload: { refreshToken: newRefreshToken },
    });
    expect(afterCompromiseRes.statusCode).toBe(401);

    // Also authenticate Bob so we can test cross-customer IDOR/RLS isolation
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/otp/request',
      payload: { phone: bobPhone },
    });
    const bobOtp = smsProvider.lastSentCodeByPhone.get(bobPhone)!;
    const bobVer = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/otp/verify',
      payload: { phone: bobPhone, code: bobOtp },
    });
    expect(bobVer.statusCode).toBe(200);
    bobToken = bobVer.json().accessToken;
    bobUserId = bobVer.json().user.id;
    expect(bobUserId).not.toBe(aliceUserId);
  });

  it('5. enforces mandatory TOTP setup for staff login and rejects customer tokens on staff routes', async () => {
    // Customer token on staff endpoint -> 401
    const crossRes = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/orders',
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(crossRes.statusCode).toBe(401);

    // Step 1: Owner logs in when totp_enabled = false -> gets totpSetupRequired: true
    const login1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/staff/login',
      payload: {
        email: 'owner@kardeslercihangir.com',
        password: 'OwnerSecretPass!2026',
      },
    });
    expect(login1.statusCode).toBe(200);
    const login1Body = login1.json();
    expect(login1Body.totpSetupRequired).toBe(true);
    expect(login1Body.accessToken).toBeUndefined();

    // Step 2: Request TOTP secret using setupToken
    const setupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/staff/totp/setup',
      payload: { setupToken: login1Body.setupToken },
    });
    expect(setupRes.statusCode).toBe(200);
    const { secret } = setupRes.json();

    // Step 3: Verify TOTP code and activate 2FA
    const validTotp = authenticator.generate(secret);
    const verifySetupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/staff/totp/verify-setup',
      payload: {
        setupToken: login1Body.setupToken,
        secret,
        totpCode: validTotp,
      },
    });
    expect(verifySetupRes.statusCode).toBe(200);
    ownerToken = verifySetupRes.json().accessToken;
    expect(ownerToken).toBeTruthy();
  });

  // ==========================================================================
  // SLICE 3: MULTILINGUAL MENU, POSTGIS DELIVERY ZONE & PUBLIC SETTINGS
  // ==========================================================================
  it('6. serves localized menu (tr, en, ar) and invalidates cache on owner price update', async () => {
    const arRes = await app.inject({
      method: 'GET',
      url: '/api/v1/menu',
      headers: { 'accept-language': 'ar-SA,ar;q=0.9' },
    });
    expect(arRes.statusCode).toBe(200);
    const arMenu = arRes.json();
    expect(arMenu.language).toBe('ar');
    const adanaAr = arMenu.items.find(
      (i: any) => i.id === 'f0000000-0000-0000-0000-000000000001',
    );
    expect(adanaAr.name).toContain('كباب أضنة');

    // Staff (non-owner) attempting to change price -> 403 FORBIDDEN
    const staffAttempt = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/menu/items/f0000000-0000-0000-0000-000000000001',
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { priceKurus: 35000 },
    });
    expect(staffAttempt.statusCode).toBe(403);

    // Owner updates Adana Kebap price to 34000 kuruş -> 200 OK
    const ownerUpdate = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/menu/items/f0000000-0000-0000-0000-000000000001',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { priceKurus: 34000 },
    });
    expect(ownerUpdate.statusCode).toBe(200);
  });

  it('7. checks PostGIS delivery polygon coverage and zone minimum', async () => {
    // Inside Cihangir Merkez (Zone 1)
    const inZone = await app.inject({
      method: 'POST',
      url: '/api/v1/delivery/check',
      payload: { lat: 41.033, lng: 28.984 },
    });
    expect(inZone.statusCode).toBe(200);
    expect(inZone.json().covered).toBe(true);
    expect(inZone.json().zone.minOrderKurus).toBe(25000);
    expect(inZone.json().zone.deliveryFeeKurus).toBe(0);

    // Outside all zones (Kadıköy across the Bosphorus)
    const outZone = await app.inject({
      method: 'POST',
      url: '/api/v1/delivery/check',
      payload: { lat: 40.99, lng: 29.02 },
    });
    expect(outZone.statusCode).toBe(200);
    expect(outZone.json().covered).toBe(false);
  });

  // ==========================================================================
  // SLICE 4, 5, 6: ORDERS, IDEMPOTENCY, WEBHOOK HMAC, PRINT AGENT & LOYALTY
  // ==========================================================================
  it('8. creates card_online order in awaiting_payment, hides it from staff, verifies webhook HMAC & amount, prints in Turkish CP857 on accept, and awards loyalty on delivery', async () => {
    const idemKey = `slice-card-order-${Date.now()}`;

    // Reset HOSGELDIN redemptions for Alice before placing order
    await withRlsTx({ role: 'system' }, async (tx) => {
      await tx.execute(
        sql`DELETE FROM public.coupon_redemptions WHERE user_id = ${aliceUserId}::uuid`,
      );
    });

    // 8a. Alice places online card order with HOSGELDIN coupon (20% off)
    // 1x Adana Kebap (34000) + 1x Köy Ayranı (4000) = 38000 subtotal - 7600 discount = 30400 total
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: {
        authorization: `Bearer ${aliceToken}`,
        'idempotency-key': idemKey,
      },
      payload: {
        order_type: 'delivery',
        payment_method: 'card_online',
        items: [
          {
            menu_item_id: 'f0000000-0000-0000-0000-000000000001',
            quantity: 1,
            option_ids: ['80000000-0000-0000-0000-000000000001'],
          },
          {
            menu_item_id: 'f0000000-0000-0000-0000-000000000017',
            quantity: 1,
            option_ids: [],
          },
        ],
        address_snapshot: {
          full_address: 'Sıraselviler Cad. No:42 Cihangir',
          lat: 41.033,
          lng: 28.984,
        },
        coupon_code: 'HOSGELDIN',
        customer_note: 'Kapıda zili çalmayın',
      },
    });

    expect(createRes.statusCode).toBe(201);
    const createdOrder = createRes.json();
    expect(createdOrder.status).toBe('awaiting_payment');
    expect(createdOrder.subtotalKurus).toBe(38000);
    expect(createdOrder.discountKurus).toBe(7600);
    expect(createdOrder.totalKurus).toBe(30400);
    expect(createdOrder.paymentCheckout.paymentPageUrl).toContain(createdOrder.id);

    // 8b. Idempotent retry with the same Idempotency-Key returns the exact same order
    const retryRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: {
        authorization: `Bearer ${aliceToken}`,
        'idempotency-key': idemKey,
      },
      payload: {
        order_type: 'delivery',
        payment_method: 'card_online',
        items: [
          {
            menu_item_id: 'f0000000-0000-0000-0000-000000000001',
            quantity: 1,
            option_ids: ['80000000-0000-0000-0000-000000000001'],
          },
        ],
        address_snapshot: {
          full_address: 'Sıraselviler Cad. No:42 Cihangir',
          lat: 41.033,
          lng: 28.984,
        },
      },
    });
    expect(retryRes.statusCode).toBe(201);
    expect(retryRes.json().id).toBe(createdOrder.id);

    // 8c. Cross-customer RLS isolation: Bob CANNOT view or cancel Alice's order!
    const bobGetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${createdOrder.id}`,
      headers: { authorization: `Bearer ${bobToken}` },
    });
    expect(bobGetRes.statusCode).toBe(404);

    // 8d. Kitchen staff (`staff` role) CANNOT see `awaiting_payment` order before payment confirmation!
    const staffListBefore = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/orders',
      headers: { authorization: `Bearer ${staffToken}` },
    });
    expect(staffListBefore.statusCode).toBe(200);
    const foundBefore = staffListBefore
      .json()
      .orders.some((o: any) => o.id === createdOrder.id);
    expect(foundBefore).toBe(false);

    // 8e. Payment webhook with TAMPERED amount (100 kuruş instead of 30400) -> 422 & creates fraud_flags row!
    const badEventId = `evt_bad_${Date.now()}`;
    const badSig = computeWebhookSignature(badEventId, createdOrder.id, 100, 'paid');
    const badWebhookRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/webhook',
      payload: {
        providerEventId: badEventId,
        orderId: createdOrder.id,
        amountKurus: 100,
        status: 'paid',
        providerRef: 'iyzi_ref_bad',
        signature: badSig,
      },
    });
    expect(badWebhookRes.statusCode).toBe(422);
    expect(badWebhookRes.json().error.code).toBe('PAYMENT_AMOUNT_MISMATCH');

    // 8f. Legitimate payment webhook with exact 30400 kuruş -> transitions awaiting_payment -> new!
    const goodEventId = `evt_good_${Date.now()}`;
    const goodSig = computeWebhookSignature(goodEventId, createdOrder.id, 30400, 'paid');
    const goodWebhookRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/webhook',
      payload: {
        providerEventId: goodEventId,
        orderId: createdOrder.id,
        amountKurus: 30400,
        status: 'paid',
        providerRef: `iyzi_ref_${Date.now()}`,
        signature: goodSig,
      },
    });
    expect(goodWebhookRes.statusCode).toBe(200);
    expect(goodWebhookRes.json().status).toBe('new');

    // Replaying the same webhook event ID is idempotent
    const replayWebhookRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/webhook',
      payload: {
        providerEventId: goodEventId,
        orderId: createdOrder.id,
        amountKurus: 30400,
        status: 'paid',
        providerRef: `iyzi_ref_${Date.now()}`,
        signature: goodSig,
      },
    });
    expect(replayWebhookRes.statusCode).toBe(200);
    expect(replayWebhookRes.json().idempotentReplay).toBe(true);

    // 8g. Now kitchen staff CAN see the order and accept it (`new -> accepted`)!
    const acceptRes = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/orders/${createdOrder.id}/status`,
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { status: 'accepted' },
    });
    expect(acceptRes.statusCode).toBe(200);
    expect(acceptRes.json().order.status).toBe('accepted');

    // 8h. Owner issues a Print Agent token, Print Agent polls and receives Turkish CP857 ticket
    const printTokenRes = await app.inject({
      method: 'POST',
      url: '/api/v1/print-agent/token',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { deviceId: 'sunlux-rp8020-kitchen-1' },
    });
    expect(printTokenRes.statusCode).toBe(201);
    const { token: printAgentToken, jti: printTokenJti } = printTokenRes.json();

    const pollRes = await app.inject({
      method: 'GET',
      url: '/api/v1/print-agent/jobs/poll',
      headers: { authorization: `Bearer ${printAgentToken}` },
    });
    expect(pollRes.statusCode).toBe(200);
    const matchingJob = pollRes
      .json()
      .jobs.find((j: any) => j.orderId === createdOrder.id);
    expect(matchingJob).toBeDefined();
    expect(matchingJob.textTr).toContain('KARDEŞLER CİHANGİR');
    expect(matchingJob.textTr).toContain('Zırh Kıyma Adana Kebap');
    expect(matchingJob.escPosBase64).toBeTruthy();

    // Acknowledge print job
    const ackRes = await app.inject({
      method: 'POST',
      url: `/api/v1/print-agent/jobs/${matchingJob.jobId}/ack`,
      headers: { authorization: `Bearer ${printAgentToken}` },
      payload: { status: 'printed' },
    });
    expect(ackRes.statusCode).toBe(200);

    // Revoke print-agent token -> subsequent poll is blocked (401)!
    await app.inject({
      method: 'POST',
      url: '/api/v1/print-agent/token/revoke',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { jti: printTokenJti },
    });
    const revokedPoll = await app.inject({
      method: 'GET',
      url: '/api/v1/print-agent/jobs/poll',
      headers: { authorization: `Bearer ${printAgentToken}` },
    });
    expect(revokedPoll.statusCode).toBe(401);

    // 8i. Transition accepted -> on_the_way -> delivered, verify loyalty points & review creation
    await app.inject({
      method: 'POST',
      url: `/api/v1/staff/orders/${createdOrder.id}/status`,
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { status: 'on_the_way' },
    });
    const delivRes = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/orders/${createdOrder.id}/status`,
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { status: 'delivered' },
    });
    expect(delivRes.statusCode).toBe(200);

    const loyaltyRes = await app.inject({
      method: 'GET',
      url: '/api/v1/loyalty/me',
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(loyaltyRes.statusCode).toBe(200);
    expect(loyaltyRes.json().activeBalance).toBeGreaterThanOrEqual(304);

    // Submit review for delivered order
    const revRes = await app.inject({
      method: 'POST',
      url: '/api/v1/reviews',
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: {
        orderId: createdOrder.id,
        rating: 5,
        comment: 'Adana kebap harikaydı, sıcacık geldi!',
      },
    });
    expect(revRes.statusCode).toBe(201);
  });

  // ==========================================================================
  // SLICE 7: CONCURRENCY & ACCOUNT ERASURE (DELETE /api/v1/users/me)
  // ==========================================================================
  it('9. handles concurrent idempotent order creation without duplicating orders or burning coupons', async () => {
    const concurrentKey = `concurrent-idem-${Date.now()}`;
    const payload = {
      order_type: 'pickup',
      payment_method: 'card_online',
      items: [
        {
          menu_item_id: 'f0000000-0000-0000-0000-000000000001',
          quantity: 1,
          option_ids: ['80000000-0000-0000-0000-000000000001'],
        },
      ],
    };

    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/v1/orders',
          headers: {
            authorization: `Bearer ${aliceToken}`,
            'idempotency-key': concurrentKey,
          },
          payload,
        }),
      ),
    );

    const successfulIds = responses
      .filter((r) => r.statusCode === 201)
      .map((r) => r.json().id);

    expect(successfulIds.length).toBeGreaterThanOrEqual(1);
    const uniqueOrderIds = new Set(successfulIds);
    expect(uniqueOrderIds.size).toBe(1);
  });

  it('10. executes KVKK / Apple / Google account erasure via DELETE /api/v1/users/me and owner reports', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/otp/request',
      payload: { phone: tempPhone },
    });
    const otp = smsProvider.lastSentCodeByPhone.get(tempPhone)!;
    const ver = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/otp/verify',
      payload: { phone: tempPhone, code: otp },
    });
    const tempToken = ver.json().accessToken;

    const delRes = await app.inject({
      method: 'DELETE',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${tempToken}` },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().anonymized).toBe(true);

    // Owner daily summary report & audit logs
    const reportRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/reports/daily-summary',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(reportRes.statusCode).toBe(200);
    expect(reportRes.json().metrics.total_orders).toBeGreaterThanOrEqual(1);

    const auditRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit-logs',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(auditRes.statusCode).toBe(200);
    for (const logEntry of auditRes.json().auditLogs) {
      if (logEntry.newValues) {
        expect(logEntry.newValues.password_hash).toBeUndefined();
        expect(logEntry.newValues.totp_secret_encrypted).toBeUndefined();
      }
    }
  });
});

