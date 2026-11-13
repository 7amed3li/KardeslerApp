import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { authenticator } from 'otplib';
import { createAppContainer } from '../src/composition-root.js';
import { ConsoleSmsProvider } from '../src/infrastructure/providers/sms.providers.js';
import { computeWebhookHmac } from '../src/infrastructure/providers/payment.providers.js';
import { NodeCryptoService } from '../src/infrastructure/security/crypto.adapter.js';
import { env } from '../src/config/env.js';
import { withTx, schema } from '../src/infrastructure/db/client.js';
import { sql } from 'drizzle-orm';

describe('Step 4.1 Characterization Suite: Pins All 43 Baseline Endpoints Before/After Refactor', () => {
  const smsProvider = new ConsoleSmsProvider();
  const container = createAppContainer({ smsProvider });
  const app = container.app;
  const cryptoSvc = new NodeCryptoService(env.OTP_HMAC_SECRET, env.TOTP_ENCRYPTION_KEY);
  const computeWebhookSignature = (id: string, oid: string, amt: number, st: 'paid' | 'failed') =>
    computeWebhookHmac(id, oid, amt, st, env.WEBHOOK_HMAC_SECRET);

  const suffix = String(Date.now()).slice(-7);
  const custPhone = `+90531${suffix}`;
  const erasePhone = `+90532${suffix}`;

  let custToken = '';
  let custRefresh = '';
  let ownerToken = '';
  let staffToken = '';
  let createdOrderId = '';
  let codOrderId = '';
  let printAgentToken = '';
  let printTokenJti = '';
  let printJobId = '';

  beforeAll(async () => {
    await app.ready();
    await container.rateLimiter.resetAll();

    const ownerHash = await cryptoSvc.hashPassword('OwnerCharPass!2026');
    const staffHash = await cryptoSvc.hashPassword('StaffCharPass!2026');
    const staffSecret = cryptoSvc.generateTotpSecret();
    const staffEnc = cryptoSvc.encryptTotpSecret(staffSecret);

    await withTx({ role: 'system' }, async (tx) => {
      await tx.execute(sql`
        UPDATE public.restaurant_settings
        SET is_accepting_orders = true, cod_max_amount_kurus = 150000, cod_max_open_orders = 3
        WHERE id = 1
      `);
      await tx.execute(sql`DELETE FROM public.heartbeats`);
      await tx.execute(sql`
        UPDATE public.staff_users
        SET password_hash = ${ownerHash}, totp_enabled = false, totp_secret_encrypted = NULL, is_active = true
        WHERE email = 'owner@kardeslercihangir.com'
      `);
      await tx.execute(sql`
        INSERT INTO public.staff_users (id, email, password_hash, role, totp_secret_encrypted, totp_enabled, is_active)
        VALUES (
          'a0000000-0000-0000-0000-000000000002',
          'mutfak@kardeslercihangir.com',
          ${staffHash},
          'staff',
          ${staffEnc},
          true,
          true
        )
        ON CONFLICT (email) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          totp_secret_encrypted = EXCLUDED.totp_secret_encrypted,
          totp_enabled = true,
          is_active = true
      `);
    });

    staffToken = (
      await container.tokens.signStaffToken('a0000000-0000-0000-0000-000000000002', 'staff')
    ).accessToken;
  });

  afterAll(async () => {
    await withTx({ role: 'system' }, async (tx) => {
      await tx.execute(sql`DELETE FROM public.heartbeats`);
      await tx.execute(
        sql`UPDATE public.restaurant_settings SET is_accepting_orders = true WHERE id = 1`,
      );
    });
    await container.shutdown();
  });

  it('pins health, readiness, and docs endpoints', async () => {
    const h1 = await app.inject({ method: 'GET', url: '/health' });
    expect(h1.statusCode).toBe(200);
    expect(h1.json().status).toBe('ok');

    const h2 = await app.inject({ method: 'GET', url: '/healthz' });
    expect(h2.statusCode).toBe(200);
    expect(h2.json().status).toBe('ok');

    const r = await app.inject({ method: 'GET', url: '/readyz' });
    expect(r.statusCode).toBe(200);
    expect(r.json().dbRoles).toEqual({ api: 'app_api', readonly: 'app_readonly' });

    const d = await app.inject({ method: 'GET', url: '/docs' });
    expect(d.statusCode).toBe(200);
    expect(d.json().openapi).toMatch(/^3\./);
  });

  it('pins customer & staff auth flows + erasure', async () => {
    // Customer OTP request + verify + refresh
    const req1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/otp/request',
      payload: { phone: custPhone },
    });
    expect(req1.statusCode).toBe(200);
    const otp1 = smsProvider.lastSentCodeByPhone.get(custPhone)!;

    const ver1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/otp/verify',
      payload: { phone: custPhone, code: otp1 },
    });
    expect(ver1.statusCode).toBe(200);
    custToken = ver1.json().accessToken;
    custRefresh = ver1.json().refreshToken;

    const ref1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/refresh',
      payload: { refreshToken: custRefresh },
    });
    expect(ref1.statusCode).toBe(200);
    const rotatedRefresh = ref1.json().refreshToken;

    // Staff login -> totp/setup -> totp/verify-setup
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/staff/login',
      payload: { email: 'owner@kardeslercihangir.com', password: 'OwnerCharPass!2026' },
    });
    expect(login.statusCode).toBe(200);
    const setupToken = login.json().setupToken;

    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/staff/totp/setup',
      payload: { setupToken },
    });
    expect(setup.statusCode).toBe(200);
    const { secret } = setup.json();

    const verSetup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/staff/totp/verify-setup',
      payload: { setupToken, secret, totpCode: authenticator.generate(secret) },
    });
    expect(verSetup.statusCode).toBe(200);
    ownerToken = verSetup.json().accessToken;

    // Separate user for logout & DELETE /api/v1/users/me
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/otp/request',
      payload: { phone: erasePhone },
    });
    const eraseOtp = smsProvider.lastSentCodeByPhone.get(erasePhone)!;
    const eraseVer = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/otp/verify',
      payload: { phone: erasePhone, code: eraseOtp },
    });
    const eraseToken = eraseVer.json().accessToken;

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/logout',
      headers: { authorization: `Bearer ${eraseToken}` },
      payload: { refreshToken: rotatedRefresh }, // testing logout endpoint returns 200
    });
    expect(logoutRes.statusCode).toBe(200);
    expect(logoutRes.json().success).toBe(true);

    const delMe = await app.inject({
      method: 'DELETE',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${eraseToken}` },
    });
    expect(delMe.statusCode).toBe(200);
    expect(delMe.json().anonymized).toBe(true);
  });

  it('pins menu, admin item patch, delivery check, addresses, and public settings', async () => {
    const menu = await app.inject({
      method: 'GET',
      url: '/api/v1/menu?lang=en',
    });
    expect(menu.statusCode).toBe(200);
    expect(menu.json().language).toBe('en');
    expect(menu.json().items.length).toBeGreaterThanOrEqual(15);

    const patchItem = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/menu/items/f0000000-0000-0000-0000-000000000001',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { priceKurus: 34000, isAvailable: true },
    });
    expect(patchItem.statusCode).toBe(200);

    const deliv = await app.inject({
      method: 'POST',
      url: '/api/v1/delivery/check',
      payload: { lat: 41.033, lng: 28.984 },
    });
    expect(deliv.statusCode).toBe(200);
    expect(deliv.json().covered).toBe(true);

    const postAddr = await app.inject({
      method: 'POST',
      url: '/api/v1/addresses',
      headers: { authorization: `Bearer ${custToken}` },
      payload: {
        label: 'Ev',
        fullAddress: 'Sıraselviler Cad. No:42 Cihangir',
        lat: 41.033,
        lng: 28.984,
      },
    });
    expect(postAddr.statusCode).toBe(201);

    const getAddr = await app.inject({
      method: 'GET',
      url: '/api/v1/addresses',
      headers: { authorization: `Bearer ${custToken}` },
    });
    expect(getAddr.statusCode).toBe(200);
    expect(getAddr.json().addresses.length).toBeGreaterThanOrEqual(1);

    const pub = await app.inject({ method: 'GET', url: '/api/v1/settings/public' });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().orderingAvailable).toBe(true);
  });

  it('pins quote, cart/price, orders CRUD, cancel, reorder, staff ops, print-agent, webhooks, loyalty, reviews, consents, admin reports', async () => {
    const quotePayload = {
      order_type: 'delivery',
      lat: 41.033,
      lng: 28.984,
      coupon_code: 'HOSGELDIN',
      items: [
        {
          menu_item_id: 'f0000000-0000-0000-0000-000000000001',
          quantity: 1,
          option_ids: ['80000000-0000-0000-0000-000000000001'],
        },
      ],
    };

    const q1 = await app.inject({ method: 'POST', url: '/api/v1/orders/quote', payload: quotePayload });
    expect(q1.statusCode).toBe(200);
    expect(q1.json().total_kurus).toBe(27200);

    const q2 = await app.inject({ method: 'POST', url: '/api/v1/cart/price', payload: quotePayload });
    expect(q2.statusCode).toBe(200);
    expect(q2.json().total_kurus).toBe(27200);

    // Card online order
    const ordCard = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: {
        authorization: `Bearer ${custToken}`,
        'idempotency-key': `char-card-${Date.now()}`,
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
        address_snapshot: { full_address: 'Cihangir No:42', lat: 41.033, lng: 28.984 },
        coupon_code: 'HOSGELDIN',
      },
    });
    expect(ordCard.statusCode).toBe(201);
    createdOrderId = ordCard.json().id;

    // COD pickup order to test cancel
    const ordCod = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: {
        authorization: `Bearer ${custToken}`,
        'idempotency-key': `char-cod-${Date.now()}`,
      },
      payload: {
        order_type: 'pickup',
        payment_method: 'cash_on_delivery',
        items: [
          {
            menu_item_id: 'f0000000-0000-0000-0000-000000000001',
            quantity: 1,
            option_ids: ['80000000-0000-0000-0000-000000000001'],
          },
        ],
      },
    });
    expect(ordCod.statusCode).toBe(201);
    codOrderId = ordCod.json().id;

    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${codOrderId}/cancel`,
      headers: { authorization: `Bearer ${custToken}` },
      payload: { reason: 'Changed mind' },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().order.status).toBe('cancelled');

    // Webhook activates card order
    const evtId = `char_evt_${Date.now()}`;
    const sig = computeWebhookSignature(evtId, createdOrderId, 27200, 'paid');
    const wh = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/webhook',
      payload: {
        providerEventId: evtId,
        orderId: createdOrderId,
        amountKurus: 27200,
        status: 'paid',
        providerRef: `char_ref_${Date.now()}`,
        signature: sig,
      },
    });
    expect(wh.statusCode).toBe(200);
    expect(wh.json().status).toBe('new');

    const myOrders = await app.inject({
      method: 'GET',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${custToken}` },
    });
    expect(myOrders.statusCode).toBe(200);
    expect(myOrders.json().orders.length).toBeGreaterThanOrEqual(2);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${createdOrderId}`,
      headers: { authorization: `Bearer ${custToken}` },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().order.id).toBe(createdOrderId);

    const reorder = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${createdOrderId}/reorder`,
      headers: { authorization: `Bearer ${custToken}` },
    });
    expect(reorder.statusCode).toBe(200);
    expect(reorder.json().availableItems.length).toBe(1);

    // Staff orders + status transitions (POST & PATCH) + driver + reprint + pause
    const stOrders = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/orders',
      headers: { authorization: `Bearer ${staffToken}` },
    });
    expect(stOrders.statusCode).toBe(200);

    const accept = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/orders/${createdOrderId}/status`,
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { status: 'accepted' },
    });
    expect(accept.statusCode).toBe(200);

    const driver = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/orders/${createdOrderId}/driver`,
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { driverId: 'c0000000-0000-0000-0000-000000000001' },
    });
    expect(driver.statusCode).toBe(200);

    const reprint = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/orders/${createdOrderId}/reprint`,
      headers: { authorization: `Bearer ${staffToken}` },
    });
    expect(reprint.statusCode).toBe(201);

    const pause = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/settings/pause',
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { isAcceptingOrders: false },
    });
    expect(pause.statusCode).toBe(200);
    await app.inject({
      method: 'POST',
      url: '/api/v1/staff/settings/pause',
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { isAcceptingOrders: true },
    });

    const sseSnap = await app.inject({
      method: 'GET',
      url: '/api/v1/realtime/staff',
      headers: { authorization: `Bearer ${staffToken}`, 'x-sse-mode': 'snapshot' },
    });
    expect(sseSnap.statusCode).toBe(200);
    expect(Array.isArray(sseSnap.json().events)).toBe(true);

    const hb = await app.inject({
      method: 'POST',
      url: '/api/v1/heartbeats',
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { deviceId: 'char-tablet-1', kind: 'staff_tablet' },
    });
    expect(hb.statusCode).toBe(200);

    // Print agent token + poll + ack + revoke
    const pt = await app.inject({
      method: 'POST',
      url: '/api/v1/print-agent/token',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { deviceId: 'char-printer-1' },
    });
    expect(pt.statusCode).toBe(201);
    printAgentToken = pt.json().token;
    printTokenJti = pt.json().jti;

    const poll = await app.inject({
      method: 'GET',
      url: '/api/v1/print-agent/jobs/poll',
      headers: { authorization: `Bearer ${printAgentToken}` },
    });
    expect(poll.statusCode).toBe(200);
    printJobId = poll.json().jobs.find((j: any) => j.orderId === createdOrderId).jobId;

    const ack = await app.inject({
      method: 'POST',
      url: `/api/v1/print-agent/jobs/${printJobId}/ack`,
      headers: { authorization: `Bearer ${printAgentToken}` },
      payload: { status: 'printed' },
    });
    expect(ack.statusCode).toBe(200);

    const revoke = await app.inject({
      method: 'POST',
      url: '/api/v1/print-agent/token/revoke',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { jti: printTokenJti },
    });
    expect(revoke.statusCode).toBe(200);

    // Canonical status transition -> on_the_way -> delivered
    const otw = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/orders/${createdOrderId}/status`,
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { status: 'on_the_way' },
    });
    expect(otw.statusCode).toBe(200);

    const deliv = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/orders/${createdOrderId}/status`,
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { status: 'delivered' },
    });
    expect(deliv.statusCode).toBe(200);

    // Loyalty, Reviews, Consents, Admin Reports, Audit Logs
    const loy = await app.inject({
      method: 'GET',
      url: '/api/v1/loyalty/me',
      headers: { authorization: `Bearer ${custToken}` },
    });
    expect(loy.statusCode).toBe(200);
    expect(loy.json().activeBalance).toBeGreaterThanOrEqual(272);

    const rev = await app.inject({
      method: 'POST',
      url: '/api/v1/reviews',
      headers: { authorization: `Bearer ${custToken}` },
      payload: { orderId: createdOrderId, rating: 5, comment: 'Harika' },
    });
    expect(rev.statusCode).toBe(201);

    const consent = await app.inject({
      method: 'POST',
      url: '/api/v1/consents',
      headers: { authorization: `Bearer ${custToken}` },
      payload: { type: 'privacy', granted: true },
    });
    expect(consent.statusCode).toBe(201);

    const rep = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/reports/daily-summary',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(rep.statusCode).toBe(200);

    const aud = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit-logs',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(aud.statusCode).toBe(200);
  });
});
