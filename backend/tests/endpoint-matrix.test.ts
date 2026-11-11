import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { authenticator } from 'otplib';
import { env } from '../src/config/env.js';
import { createAppContainer } from '../src/composition-root.js';
import { NodeCryptoService } from '../src/infrastructure/security/crypto.adapter.js';
import { ConsoleSmsProvider } from '../src/infrastructure/providers/sms.providers.js';
import { withTx } from '../src/infrastructure/db/client.js';
import { ENDPOINT_TEST_REGISTRY } from './endpoint-registry.js';

describe('Step 5 Full 66-Endpoint Security, Validation, RBAC & Side-Effects Matrix', () => {
  const smsProvider = new ConsoleSmsProvider();
  const container = createAppContainer({ smsProvider });
  const cryptoSvc = new NodeCryptoService(env.OTP_HMAC_SECRET, env.TOTP_ENCRYPTION_KEY);
  const app = container.app;

  const suf = String(Date.now()).slice(-7);
  const phoneA = `+90531${suf}`;
  const phoneB = `+90532${suf}`;
  const ownerId = 'a0000000-0000-0000-0000-000000000001';
  const staffId = 'a0000000-0000-0000-0000-000000000002';

  let customerAToken = '';
  let customerARefresh = '';
  let customerBToken = '';
  let customerAId = '';
  let staffToken = '';
  let ownerToken = '';
  let printToken = '';
  let printJti = '';

  const hitEndpoints = new Set<string>();
  const track = (method: string, path: string) => hitEndpoints.add(`${method} ${path}`);

  function makeAlgNoneJwt(sub: string): string {
    const h = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify({ sub, role: 'owner', iss: 'kardesler-api', aud: 'kardesler-staff' })).toString('base64url');
    return `${h}.${p}.`;
  }

  function signWebhook(body: { providerEventId: string; orderId: string; amountKurus: number; status: string }) {
    return crypto
      .createHmac('sha256', env.WEBHOOK_HMAC_SECRET)
      .update(`${body.providerEventId}:${body.orderId}:${body.amountKurus}:${body.status}`)
      .digest('hex');
  }

  beforeAll(async () => {
    await app.ready();
    await container.rateLimiter.resetAll();

    for (const [phone, cb] of [
      [phoneA, (d: any) => { customerAToken = d.accessToken; customerARefresh = d.refreshToken; customerAId = d.user?.id ?? d.userId; }],
      [phoneB, (d: any) => { customerBToken = d.accessToken; }],
    ] as const) {
      await app.inject({ method: 'POST', url: '/api/v1/auth/customer/otp/request', payload: { phone } });
      const code = smsProvider.lastSentCodeByPhone.get(phone)!;
      const ver = await app.inject({ method: 'POST', url: '/api/v1/auth/customer/otp/verify', payload: { phone, code } });
      cb(ver.json());
    }

    ownerToken = (await container.tokens.signStaffToken(ownerId, 'owner')).accessToken;
    staffToken = (await container.tokens.signStaffToken(staffId, 'staff')).accessToken;
  });

  afterAll(async () => {
    await container.shutdown();
  });

  it('1. exercises health, docs, public endpoints, and enforces strict validation + 100KB limit + error shape', async () => {
    for (const url of ['/health', '/healthz', '/readyz', '/docs']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(res.headers['x-request-id']).toBeDefined();
      track('GET', url);
    }

    const bannerRes = await app.inject({ method: 'GET', url: '/api/v1/banners' });
    expect(bannerRes.statusCode).toBe(200);
    track('GET', '/api/v1/banners');

    const menuRes = await app.inject({ method: 'GET', url: '/api/v1/menu' });
    expect(menuRes.statusCode).toBe(200);
    track('GET', '/api/v1/menu');

    const pubSet = await app.inject({ method: 'GET', url: '/api/v1/settings/public' });
    expect(pubSet.statusCode).toBe(200);
    track('GET', '/api/v1/settings/public');

    const delCheck = await app.inject({ method: 'POST', url: '/api/v1/delivery/check', payload: { lat: 41.0335, lng: 28.9835 } });
    expect(delCheck.statusCode).toBe(200);
    track('POST', '/api/v1/delivery/check');

    // .strict() rejects extra fields; oversized >100KB payload rejected; zero SQL/stack leakage
    const strictReject = await app.inject({
      method: 'POST',
      url: '/api/v1/delivery/check',
      payload: { lat: 41.0335, lng: 28.9835, priceOverride: 0 },
    });
    expect(strictReject.statusCode).toBe(400);
    expect(strictReject.json().error.code).toBe('VALIDATION_ERROR');
    expect(strictReject.json().error.requestId).toBeDefined();
    expect(strictReject.body).not.toContain('at ');

    const hugePayload = { lat: 41.0335, lng: 28.9835, junk: 'x'.repeat(110 * 1024) };
    const overLimit = await app.inject({ method: 'POST', url: '/api/v1/delivery/check', payload: hugePayload });
    expect([400, 413]).toContain(overLimit.statusCode);
  });

  it('2. exercises all auth endpoints, alg=none / wrong-aud rejection, TOTP setup flow, and JTI revocation', async () => {
    const reqOtp = await app.inject({ method: 'POST', url: '/api/v1/auth/customer/otp/request', payload: { phone: `+90539${suf}` } });
    expect(reqOtp.statusCode).toBe(200);
    track('POST', '/api/v1/auth/customer/otp/request');

    const otpCode = smsProvider.lastSentCodeByPhone.get(`+90539${suf}`)!;
    const verOtp = await app.inject({ method: 'POST', url: '/api/v1/auth/customer/otp/verify', payload: { phone: `+90539${suf}`, code: otpCode } });
    expect(verOtp.statusCode).toBe(200);
    track('POST', '/api/v1/auth/customer/otp/verify');

    const refRes = await app.inject({ method: 'POST', url: '/api/v1/auth/customer/refresh', payload: { refreshToken: customerARefresh } });
    expect(refRes.statusCode).toBe(200);
    customerAToken = refRes.json().accessToken;
    customerARefresh = refRes.json().refreshToken;
    track('POST', '/api/v1/auth/customer/refresh');

    // Temporary temp-user logout
    const outRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/logout',
      headers: { authorization: `Bearer ${verOtp.json().accessToken}` },
      payload: { refreshToken: verOtp.json().refreshToken },
    });
    expect(outRes.statusCode).toBe(200);
    track('POST', '/api/v1/auth/customer/logout');

    // Auth failure modes: alg=none, malformed header, customer token on staff route
    const algNone = await app.inject({ method: 'GET', url: '/api/v1/admin/staff', headers: { authorization: `Bearer ${makeAlgNoneJwt(ownerId)}` } });
    expect(algNone.statusCode).toBe(401);
    const malformed = await app.inject({ method: 'GET', url: '/api/v1/addresses', headers: { authorization: 'NotBearer xyz' } });
    expect(malformed.statusCode).toBe(401);
    const wrongAud = await app.inject({ method: 'GET', url: '/api/v1/staff/orders', headers: { authorization: `Bearer ${customerAToken}` } });
    expect(wrongAud.statusCode).toBe(401);

    // Staff login + TOTP setup + verify-setup using disposable staff account
    const staffEmail = `mat_${suf}@kardesler.test`;
    const pwdHash = await cryptoSvc.hashPassword('MatrixPass!2026');
    await withTx({ role: 'system' }, async (tx) => {
      await tx.execute(sql`
        INSERT INTO public.staff_users (email, password_hash, role, is_active)
        VALUES (${staffEmail}, ${pwdHash}, 'staff', true)
      `);
    });
    const stLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/staff/login', payload: { email: staffEmail, password: 'MatrixPass!2026' } });
    expect(stLogin.statusCode).toBe(200);
    expect(stLogin.json().totpSetupRequired).toBe(true);
    track('POST', '/api/v1/auth/staff/login');

    const setup = await app.inject({ method: 'POST', url: '/api/v1/auth/staff/totp/setup', payload: { setupToken: stLogin.json().setupToken } });
    expect(setup.statusCode).toBe(200);
    track('POST', '/api/v1/auth/staff/totp/setup');

    const totpCode = authenticator.generate(setup.json().secret);
    const verSetup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/staff/totp/verify-setup',
      payload: { setupToken: stLogin.json().setupToken, secret: setup.json().secret, totpCode },
    });
    expect(verSetup.statusCode).toBe(200);
    expect(verSetup.json().accessToken).toBeDefined();
    track('POST', '/api/v1/auth/staff/totp/verify-setup');

    // Issue + revoke + verify revoked JTI blocked
    const tempPrint = await app.inject({
      method: 'POST',
      url: '/api/v1/print-agent/token',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { deviceId: `rev-dev-${suf}` },
    });
    expect(tempPrint.statusCode).toBe(201);
    const revRes = await app.inject({
      method: 'POST',
      url: '/api/v1/print-agent/token/revoke',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { jti: tempPrint.json().jti },
    });
    expect(revRes.statusCode).toBe(200);
    track('POST', '/api/v1/print-agent/token/revoke');

    const revokedPoll = await app.inject({
      method: 'GET',
      url: '/api/v1/print-agent/jobs/poll',
      headers: { authorization: `Bearer ${tempPrint.json().token}` },
    });
    expect(revokedPoll.statusCode).toBe(401);

    // Issue active print token for later tests
    const activePrint = await app.inject({
      method: 'POST',
      url: '/api/v1/print-agent/token',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { deviceId: `sunlux-mat-${suf}` },
    });
    expect(activePrint.statusCode).toBe(201);
    printToken = activePrint.json().token;
    printJti = activePrint.json().jti;
    expect(printJti).toBeDefined();
    track('POST', '/api/v1/print-agent/token');
  });

  it('3. exercises all customer profile, device, referral & address CRUD + cross-customer IDOR blocks', async () => {
    // SQLi/Unicode string safely stored as literal name without SQL error
    const patchMe = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${customerAToken}` },
      payload: { name: "Ayşe'; DROP TABLE orders; --", preferredLanguage: 'tr' },
    });
    expect(patchMe.statusCode).toBe(200);
    track('PATCH', '/api/v1/users/me');

    const dev = await app.inject({
      method: 'POST',
      url: '/api/v1/devices',
      headers: { authorization: `Bearer ${customerAToken}` },
      payload: { pushToken: `ExponentPushToken[mat_${suf}]`, platform: 'ios', appVersion: '1.0.0' },
    });
    expect(dev.statusCode).toBe(201);
    track('POST', '/api/v1/devices');

    const refs = await app.inject({
      method: 'GET',
      url: '/api/v1/referrals/me',
      headers: { authorization: `Bearer ${customerAToken}` },
    });
    expect(refs.statusCode).toBe(200);
    track('GET', '/api/v1/referrals/me');

    const createAddr = await app.inject({
      method: 'POST',
      url: '/api/v1/addresses',
      headers: { authorization: `Bearer ${customerAToken}` },
      payload: { label: 'Ev', fullAddress: 'Cihangir Mah. Akyol Cd. No:12', lat: 41.0335, lng: 28.9835 },
    });
    expect(createAddr.statusCode).toBe(201);
    const addrId = createAddr.json().id;
    track('POST', '/api/v1/addresses');

    const listAddr = await app.inject({ method: 'GET', url: '/api/v1/addresses', headers: { authorization: `Bearer ${customerAToken}` } });
    expect(listAddr.statusCode).toBe(200);
    track('GET', '/api/v1/addresses');

    // Cross-user IDOR: Customer B cannot PATCH or DELETE Customer A's address
    const idorPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/addresses/${addrId}`,
      headers: { authorization: `Bearer ${customerBToken}` },
      payload: { label: 'Stolen' },
    });
    expect(idorPatch.statusCode).toBe(404);

    const patchAddr = await app.inject({
      method: 'PATCH',
      url: `/api/v1/addresses/${addrId}`,
      headers: { authorization: `Bearer ${customerAToken}` },
      payload: { label: 'Güncel Ev' },
    });
    expect(patchAddr.statusCode).toBe(200);
    track('PATCH', '/api/v1/addresses/:id');

    const delAddr = await app.inject({
      method: 'DELETE',
      url: `/api/v1/addresses/${addrId}`,
      headers: { authorization: `Bearer ${customerAToken}` },
    });
    expect(delAddr.statusCode).toBe(200);
    track('DELETE', '/api/v1/addresses/:id');

    // Disposable user account erasure
    const delPhone = `+90538${suf}`;
    await app.inject({ method: 'POST', url: '/api/v1/auth/customer/otp/request', payload: { phone: delPhone } });
    const dVer = await app.inject({ method: 'POST', url: '/api/v1/auth/customer/otp/verify', payload: { phone: delPhone, code: smsProvider.lastSentCodeByPhone.get(delPhone)! } });
    const delMe = await app.inject({ method: 'DELETE', url: '/api/v1/users/me', headers: { authorization: `Bearer ${dVer.json().accessToken}` } });
    expect(delMe.statusCode).toBe(200);
    track('DELETE', '/api/v1/users/me');
  });

  it('4. exercises orders, cart, webhook, staff/print/realtime, loyalty/reviews/consents, and verifies DB side effects', async () => {
    const itemsPayload = [{ menu_item_id: 'f0000000-0000-0000-0000-000000000001', quantity: 1, option_ids: ['80000000-0000-0000-0000-000000000001'] }];
    const quote = await app.inject({ method: 'POST', url: '/api/v1/orders/quote', payload: { order_type: 'pickup', items: itemsPayload } });
    expect(quote.statusCode).toBe(200);
    track('POST', '/api/v1/orders/quote');

    const cartPrice = await app.inject({ method: 'POST', url: '/api/v1/cart/price', payload: { order_type: 'pickup', items: itemsPayload } });
    expect(cartPrice.statusCode).toBe(200);
    track('POST', '/api/v1/cart/price');

    // Create + cancel order A
    const c1 = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${customerAToken}` },
      payload: { order_type: 'pickup', payment_method: 'cash_on_delivery', idempotency_key: `mat-can-${suf}`, items: itemsPayload },
    });
    expect(c1.statusCode).toBe(201);
    const canId = c1.json().id;
    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${canId}/cancel`,
      headers: { authorization: `Bearer ${customerAToken}` },
      payload: { reason: 'Vazgeçtim' },
    });
    expect(cancelRes.statusCode).toBe(200);
    track('POST', '/api/v1/orders/:id/cancel');

    // Create card order + duplicate idempotency key check
    const idemKey = `mat-card-${suf}`;
    const c2 = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${customerAToken}` },
      payload: { order_type: 'pickup', payment_method: 'card_online', idempotency_key: idemKey, items: itemsPayload },
    });
    const c2Dup = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${customerAToken}` },
      payload: { order_type: 'pickup', payment_method: 'card_online', idempotency_key: idemKey, items: itemsPayload },
    });
    expect(c2.statusCode).toBe(201);
    expect(c2Dup.json().id).toBe(c2.json().id);
    const ordId = c2.json().id;
    track('POST', '/api/v1/orders');

    const listOrd = await app.inject({ method: 'GET', url: '/api/v1/orders', headers: { authorization: `Bearer ${customerAToken}` } });
    expect(listOrd.statusCode).toBe(200);
    track('GET', '/api/v1/orders');

    const detailOrd = await app.inject({ method: 'GET', url: `/api/v1/orders/${ordId}`, headers: { authorization: `Bearer ${customerAToken}` } });
    expect(detailOrd.statusCode).toBe(200);
    track('GET', '/api/v1/orders/:id');

    // IDOR: Customer B cannot view Customer A's order
    const idorDetail = await app.inject({ method: 'GET', url: `/api/v1/orders/${ordId}`, headers: { authorization: `Bearer ${customerBToken}` } });
    expect(idorDetail.statusCode).toBe(404);

    const reorder = await app.inject({ method: 'POST', url: `/api/v1/orders/${ordId}/reorder`, headers: { authorization: `Bearer ${customerAToken}` } });
    expect(reorder.statusCode).toBe(200);
    track('POST', '/api/v1/orders/:id/reorder');

    // Webhook bad HMAC -> 401, valid HMAC -> 200 (payment_events DB side-effect)
    const whBody = { providerEventId: `mat-evt-${suf}`, orderId: ordId, amountKurus: c2.json().totalKurus, status: 'paid' as const, providerRef: `mat-ref-${suf}` };
    const badWh = await app.inject({ method: 'POST', url: '/api/v1/payments/webhook', payload: { ...whBody, signature: '0'.repeat(64) } });
    expect(badWh.statusCode).toBe(401);
    const okWh = await app.inject({ method: 'POST', url: '/api/v1/payments/webhook', payload: { ...whBody, signature: signWebhook(whBody) } });
    expect(okWh.statusCode).toBe(200);
    track('POST', '/api/v1/payments/webhook');

    // Staff & Print-Agent & Realtime
    const stList = await app.inject({ method: 'GET', url: '/api/v1/staff/orders', headers: { authorization: `Bearer ${staffToken}` } });
    expect(stList.statusCode).toBe(200);
    track('GET', '/api/v1/staff/orders');

    const accept = await app.inject({ method: 'POST', url: `/api/v1/staff/orders/${ordId}/status`, headers: { authorization: `Bearer ${staffToken}` }, payload: { status: 'accepted' } });
    expect(accept.statusCode).toBe(200);
    track('POST', '/api/v1/staff/orders/:id/status');

    const poll = await app.inject({ method: 'GET', url: '/api/v1/print-agent/jobs/poll', headers: { authorization: `Bearer ${printToken}` } });
    expect(poll.statusCode).toBe(200);
    const job = poll.json().jobs.find((j: any) => j.orderId === ordId);
    expect(job).toBeDefined();
    track('GET', '/api/v1/print-agent/jobs/poll');

    const ack = await app.inject({ method: 'POST', url: `/api/v1/print-agent/jobs/${job.jobId}/ack`, headers: { authorization: `Bearer ${printToken}` }, payload: { status: 'printed' } });
    expect(ack.statusCode).toBe(200);
    track('POST', '/api/v1/print-agent/jobs/:id/ack');

    const reprint = await app.inject({ method: 'POST', url: `/api/v1/staff/orders/${ordId}/reprint`, headers: { authorization: `Bearer ${staffToken}` } });
    expect(reprint.statusCode).toBe(201);
    track('POST', '/api/v1/staff/orders/:id/reprint');

    const drv = await app.inject({ method: 'POST', url: `/api/v1/staff/orders/${ordId}/driver`, headers: { authorization: `Bearer ${staffToken}` }, payload: { driverId: 'c0000000-0000-0000-0000-000000000001' } });
    expect(drv.statusCode).toBe(200);
    track('POST', '/api/v1/staff/orders/:id/driver');

    const otw = await app.inject({ method: 'PATCH', url: `/api/v1/orders/${ordId}/status`, headers: { authorization: `Bearer ${staffToken}` }, payload: { status: 'on_the_way' } });
    expect(otw.statusCode).toBe(200);
    const deliv = await app.inject({ method: 'PATCH', url: `/api/v1/orders/${ordId}/status`, headers: { authorization: `Bearer ${staffToken}` }, payload: { status: 'delivered' } });
    expect(deliv.statusCode).toBe(200);
    track('PATCH', '/api/v1/orders/:id/status');

    const pauseOn = await app.inject({ method: 'POST', url: '/api/v1/staff/settings/pause', headers: { authorization: `Bearer ${staffToken}` }, payload: { isAcceptingOrders: true } });
    expect(pauseOn.statusCode).toBe(200);
    track('POST', '/api/v1/staff/settings/pause');

    const hb = await app.inject({ method: 'POST', url: '/api/v1/heartbeats', headers: { authorization: `Bearer ${staffToken}` }, payload: { deviceId: `tab-${suf}`, kind: 'staff_tablet' } });
    expect(hb.statusCode).toBe(200);
    track('POST', '/api/v1/heartbeats');

    const rtSnap = await app.inject({ method: 'GET', url: '/api/v1/realtime/staff', headers: { authorization: `Bearer ${staffToken}`, 'x-sse-mode': 'snapshot' } });
    expect(rtSnap.statusCode).toBe(200);
    track('GET', '/api/v1/realtime/staff');

    const loy = await app.inject({ method: 'GET', url: '/api/v1/loyalty/me', headers: { authorization: `Bearer ${customerAToken}` } });
    expect(loy.statusCode).toBe(200);
    track('GET', '/api/v1/loyalty/me');

    const rev = await app.inject({ method: 'POST', url: '/api/v1/reviews', headers: { authorization: `Bearer ${customerAToken}` }, payload: { orderId: ordId, rating: 5, comment: 'Harika!' } });
    expect(rev.statusCode).toBe(201);
    track('POST', '/api/v1/reviews');

    const con = await app.inject({ method: 'POST', url: '/api/v1/consents', headers: { authorization: `Bearer ${customerAToken}` }, payload: { type: 'marketing_sms', granted: true } });
    expect(con.statusCode).toBe(201);
    track('POST', '/api/v1/consents');

    // Verify DB side-effects: order_events, print_jobs, payment_events, loyalty_ledger
    await withTx({ role: 'system' }, async (tx) => {
      const evts = await tx.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM public.order_events WHERE order_id = ${ordId}::uuid`);
      expect(evts[0].count).toBeGreaterThanOrEqual(4);
      const pe = await tx.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM public.payment_events WHERE provider_event_id = ${whBody.providerEventId}`);
      expect(pe[0].count).toBe(1);
      const ll = await tx.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM public.loyalty_ledger WHERE user_id = ${customerAId}::uuid AND order_id = ${ordId}::uuid`);
      expect(ll[0].count).toBe(1);
    });
  });

  it('5. exercises all owner menu/governance CRUD routes, blocks staff RBAC (403), checks rate limiting, and verifies all 66 endpoints covered', async () => {
    // Staff role must receive 403 on owner-only endpoints
    const staffBlocked = await app.inject({ method: 'GET', url: '/api/v1/admin/reports/daily-summary', headers: { authorization: `Bearer ${staffToken}` } });
    expect(staffBlocked.statusCode).toBe(403);

    // Owner menu category & item CRUD
    const crCat = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/menu/categories',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { sortOrder: 99, isActive: true, translations: [{ language: 'tr', name: `Mat Kat ${suf}` }] },
    });
    expect(crCat.statusCode).toBe(201);
    const catId = crCat.json().id;
    track('POST', '/api/v1/admin/menu/categories');

    const upCat = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/menu/categories/${catId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { sortOrder: 100 },
    });
    expect(upCat.statusCode).toBe(200);
    track('PATCH', '/api/v1/admin/menu/categories/:id');

    const crItem = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/menu/items',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { categoryId: catId, priceKurus: 25000, vatRatePercent: 10, isAvailable: true, sortOrder: 1, allergens: [], translations: [{ language: 'tr', name: `Mat Ürün ${suf}` }] },
    });
    expect(crItem.statusCode).toBe(201);
    const itemId = crItem.json().id;
    track('POST', '/api/v1/admin/menu/items');

    const upItem = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/menu/items/${itemId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { priceKurus: 26000 },
    });
    expect(upItem.statusCode).toBe(200);
    track('PATCH', '/api/v1/admin/menu/items/:id');

    const delItem = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/menu/items/${itemId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(delItem.statusCode).toBe(200);
    track('DELETE', '/api/v1/admin/menu/items/:id');

    // Governance & Reports
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/reports/daily-summary', headers: { authorization: `Bearer ${ownerToken}` } })).statusCode).toBe(200);
    track('GET', '/api/v1/admin/reports/daily-summary');

    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/coupons', headers: { authorization: `Bearer ${ownerToken}` } })).statusCode).toBe(200);
    track('GET', '/api/v1/admin/coupons');

    const crCoup = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/coupons',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { code: `MAT${suf}`, type: 'fixed_amount', value: 2000, minOrderKurus: 5000, startsAt: '2026-01-01T00:00:00Z', endsAt: '2027-01-01T00:00:00Z' },
    });
    expect(crCoup.statusCode).toBe(201);
    track('POST', '/api/v1/admin/coupons');

    const upCoup = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/coupons/${crCoup.json().id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { isActive: false },
    });
    expect(upCoup.statusCode).toBe(200);
    track('PATCH', '/api/v1/admin/coupons/:id');

    const listZones = await app.inject({ method: 'GET', url: '/api/v1/admin/zones', headers: { authorization: `Bearer ${ownerToken}` } });
    expect(listZones.statusCode).toBe(200);
    track('GET', '/api/v1/admin/zones');

    const firstZone = listZones.json().zones[0];
    const upZone = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/zones/${firstZone.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { estimatedMinutes: firstZone.estimatedMinutes ?? 30 },
    });
    expect(upZone.statusCode).toBe(200);
    track('PATCH', '/api/v1/admin/zones/:id');

    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/drivers', headers: { authorization: `Bearer ${ownerToken}` } })).statusCode).toBe(200);
    track('GET', '/api/v1/admin/drivers');

    const crDrv = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/drivers',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: `Kurye ${suf}`, phone: `+90530${suf}` },
    });
    expect(crDrv.statusCode).toBe(201);
    track('POST', '/api/v1/admin/drivers');

    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/staff', headers: { authorization: `Bearer ${ownerToken}` } })).statusCode).toBe(200);
    track('GET', '/api/v1/admin/staff');

    // Seed + resolve fraud flag
    let fraudId = '';
    await withTx({ role: 'system' }, async (tx) => {
      const [ff] = await tx.execute<{ id: string }>(sql`
        INSERT INTO public.fraud_flags (flag_type, severity, details)
        VALUES ('otp_abuse', 'low', '{}'::jsonb) RETURNING id
      `);
      fraudId = ff.id;
    });
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/fraud-flags', headers: { authorization: `Bearer ${ownerToken}` } })).statusCode).toBe(200);
    track('GET', '/api/v1/admin/fraud-flags');

    const resFlag = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/fraud-flags/${fraudId}/resolve`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(resFlag.statusCode).toBe(200);
    track('POST', '/api/v1/admin/fraud-flags/:id/resolve');

    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/banners', headers: { authorization: `Bearer ${ownerToken}` } })).statusCode).toBe(200);
    track('GET', '/api/v1/admin/banners');

    const crBanner = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/banners',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { imageUrl: 'https://cdn.example.com/b.jpg', titleTranslations: { tr: 'Kampanya' }, targetType: 'none', startsAt: '2026-01-01T00:00:00Z', endsAt: '2027-01-01T00:00:00Z' },
    });
    expect(crBanner.statusCode).toBe(201);
    track('POST', '/api/v1/admin/banners');

    const patchSettings = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { isAcceptingOrders: true },
    });
    expect(patchSettings.statusCode).toBe(200);
    track('PATCH', '/api/v1/admin/settings');

    const auditRes = await app.inject({ method: 'GET', url: '/api/v1/admin/audit-logs', headers: { authorization: `Bearer ${ownerToken}` } });
    expect(auditRes.statusCode).toBe(200);
    expect(auditRes.json().auditLogs.length).toBeGreaterThan(0);
    track('GET', '/api/v1/admin/audit-logs');

    // Rate limiting check (clean 429)
    let hit429 = false;
    for (let i = 0; i < 6; i++) {
      const r = await app.inject({ method: 'POST', url: '/api/v1/auth/customer/otp/request', payload: { phone: `+90534${suf}` } });
      if (r.statusCode === 429) {
        hit429 = true;
        expect(r.json().error.code).toBe('RATE_LIMITED');
        break;
      }
    }
    expect(hit429).toBe(true);

    // Assert every single route in ENDPOINT_TEST_REGISTRY was exercised by this suite
    const missed = ENDPOINT_TEST_REGISTRY.map((e) => `${e.method} ${e.path}`).filter((k) => !hitEndpoints.has(k));
    expect(missed).toEqual([]);
    expect(hitEndpoints.size).toBe(66);
  });
});
