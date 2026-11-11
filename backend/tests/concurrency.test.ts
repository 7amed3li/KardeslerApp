import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createAppContainer } from '../src/composition-root.js';
import { ConsoleSmsProvider } from '../src/infrastructure/providers/sms.providers.js';
import { withTx } from '../src/infrastructure/db/client.js';

describe('Step 5 Concurrency Tests (Idempotency, Coupon Race & Accept/Cancel Race)', () => {
  const smsProvider = new ConsoleSmsProvider();
  const container = createAppContainer({ smsProvider });
  const app = container.app;

  const suf = String(Date.now()).slice(-7);
  const phoneA = `+90536${suf}`;
  const phoneB = `+90537${suf}`;
  let tokenA = '';
  let tokenB = '';
  let staffToken = '';
  const limitedCouponCode = `RACE1_${suf}`;

  beforeAll(async () => {
    await app.ready();
    await container.rateLimiter.resetAll();

    for (const [phone, assign] of [
      [phoneA, (t: string) => { tokenA = t; }],
      [phoneB, (t: string) => { tokenB = t; }],
    ] as const) {
      await app.inject({ method: 'POST', url: '/api/v1/auth/customer/otp/request', payload: { phone } });
      const code = smsProvider.lastSentCodeByPhone.get(phone)!;
      const ver = await app.inject({ method: 'POST', url: '/api/v1/auth/customer/otp/verify', payload: { phone, code } });
      assign(ver.json().accessToken);
    }

    staffToken = (await container.tokens.signStaffToken('a0000000-0000-0000-0000-000000000002', 'staff')).accessToken;

    await withTx({ role: 'system' }, async (tx) => {
      await tx.execute(sql`
        INSERT INTO public.coupons (code, type, value, min_order_kurus, starts_at, ends_at, max_total_uses, max_uses_per_user, first_order_only, applies_to, is_active)
        VALUES (${limitedCouponCode}, 'fixed_amount', 5000, 10000, clock_timestamp() - interval '1 hour', clock_timestamp() + interval '1 day', 1, 1, false, 'all', true)
      `);
    });
  });

  afterAll(async () => {
    await container.shutdown();
  });

  it('1. prevents two customers racing on a coupon with max_total_uses=1 from exceeding the cap', async () => {
    const bodyFor = (key: string) => ({
      order_type: 'pickup',
      payment_method: 'cash_on_delivery',
      idempotency_key: key,
      coupon_code: limitedCouponCode,
      items: [{ menu_item_id: 'f0000000-0000-0000-0000-000000000001', quantity: 1, option_ids: ['80000000-0000-0000-0000-000000000001'] }],
    });

    const [rA, rB] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/v1/orders', headers: { authorization: `Bearer ${tokenA}` }, payload: bodyFor(`race-a-${Date.now()}`) }),
      app.inject({ method: 'POST', url: '/api/v1/orders', headers: { authorization: `Bearer ${tokenB}` }, payload: bodyFor(`race-b-${Date.now()}`) }),
    ]);

    const statuses = [rA.statusCode, rB.statusCode].sort();
    expect(statuses).toEqual([201, 422]);
  });

  it('2. resolves simultaneous staff accept vs customer cancel cleanly without violating state machine', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        order_type: 'pickup',
        payment_method: 'cash_on_delivery',
        idempotency_key: `race-ac-${Date.now()}`,
        items: [{ menu_item_id: 'f0000000-0000-0000-0000-000000000001', quantity: 1, option_ids: ['80000000-0000-0000-0000-000000000001'] }],
      },
    });
    expect(create.statusCode).toBe(201);
    const orderId = create.json().id;

    const [acceptRes, cancelRes] = await Promise.all([
      app.inject({ method: 'POST', url: `/api/v1/staff/orders/${orderId}/status`, headers: { authorization: `Bearer ${staffToken}` }, payload: { status: 'accepted' } }),
      app.inject({ method: 'POST', url: `/api/v1/orders/${orderId}/cancel`, headers: { authorization: `Bearer ${tokenA}` }, payload: { reason: 'Simultaneous cancel' } }),
    ]);

    const codes = [acceptRes.statusCode, cancelRes.statusCode].sort();
    expect(codes).toEqual([200, 409]);
  });
});

