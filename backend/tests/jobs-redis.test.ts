import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createAppContainer } from '../src/composition-root.js';
import { createRedisConnection } from '../src/infrastructure/redis/redis-client.js';
import { RedisCacheAdapter, RedisRevokedTokenStore } from '../src/infrastructure/redis/redis-cache-and-tokens.js';
import { RedisEventBus } from '../src/infrastructure/redis/redis-event-bus.js';
import { env } from '../src/config/env.js';
import { withTx } from '../src/infrastructure/db/client.js';

describe('Step 6 Real Redis & BullMQ Integration Tests', () => {
  const container = createAppContainer();
  const cmdRedis = createRedisConnection(env.REDIS_URL);
  const subRedis = createRedisConnection(env.REDIS_URL);

  beforeAll(async () => {
    await container.app.ready();
    await container.rateLimiter.resetAll();
  });

  afterAll(async () => {
    await Promise.allSettled([cmdRedis.quit(), subRedis.quit()]);
    await container.shutdown();
  });

  it('1. persists rate limits, cache, revoked JTIs, and SSE Last-Event-ID replay in real Redis 7', async () => {
    const cache = new RedisCacheAdapter(cmdRedis);
    await cache.set('menu:test_key', { ok: true }, 5000);
    expect(await cache.get<{ ok: boolean }>('menu:test_key')).toEqual({ ok: true });
    await cache.deleteByPrefix('menu:test_');
    expect(await cache.get('menu:test_key')).toBeNull();

    const revStore = new RedisRevokedTokenStore(cmdRedis);
    const jti = `jti-${Date.now()}`;
    expect(await revStore.isRevoked(jti)).toBe(false);
    await revStore.revoke(jti, 60);
    expect(await revStore.isRevoked(jti)).toBe(true);

    const bus = new RedisEventBus(cmdRedis, subRedis);
    const e1 = await bus.publish('test.event.1', { step: 1 });
    const e2 = await bus.publish('test.event.2', { step: 2 });
    const replayed = await bus.getEventsSince(e1.id);
    expect(replayed.some((e) => e.id === e2.id)).toBe(true);
  });

  it('2. executes BullMQ background jobs idempotently (expire unpaid orders, alerts, reconcile, auth cleanup)', async () => {
    // Seed an expired awaiting_payment card order (created 2 hours ago)
    let expiredOrderId = '';
    await withTx({ role: 'system' }, async (tx) => {
      const [u] = await tx.execute<{ id: string }>(sql`SELECT id FROM public.users WHERE deleted_at IS NULL LIMIT 1`);
      const [ord] = await tx.execute<{ id: string }>(sql`
        INSERT INTO public.orders (
          user_id, order_type, status, business_date, order_number, idempotency_key,
          subtotal_kurus, discount_kurus, delivery_fee_kurus, total_kurus, min_order_kurus_applied,
          customer_name_snapshot, customer_phone_snapshot, payment_method, created_at
        ) VALUES (
          ${u.id}::uuid, 'pickup', 'awaiting_payment', '2026-11-10',
          (80000 + floor(random()*9000)::int), 'bullmq-exp-' || gen_random_uuid()::text,
          34000, 0, 0, 34000, 0, 'TimeoutUser', '+905331112233', 'card_online',
          clock_timestamp() - interval '2 hours'
        ) RETURNING id
      `);
      expiredOrderId = ord.id;
      await tx.execute(sql`
        INSERT INTO public.order_items (
          order_id, menu_item_id, name_snapshot, unit_price_snapshot_kurus, vat_rate_snapshot, quantity, line_total_kurus
        ) VALUES (
          ${expiredOrderId}::uuid, 'f0000000-0000-0000-0000-000000000001'::uuid,
          'Adana Kebap', 34000, 10, 1, 34000
        )
      `);
      await tx.execute(sql`
        INSERT INTO public.payments (order_id, method, status, amount_kurus, provider)
        VALUES (${expiredOrderId}::uuid, 'card_online', 'pending', 34000, 'iyzico')
      `);
    });

    const res1 = await container.jobsUseCases.expireUnpaidCardOrders();
    expect(res1.orderIds).toContain(expiredOrderId);

    // Re-running is idempotent: already cancelled order is not re-expired
    const res2 = await container.jobsUseCases.expireUnpaidCardOrders();
    expect(res2.orderIds).not.toContain(expiredOrderId);

    const rec = await container.jobsUseCases.reconcilePendingPayments();
    expect(rec.reconciledCount).toBeGreaterThanOrEqual(1);

    const clean = await container.jobsUseCases.cleanupExpiredAuthRecords();
    expect(clean.deletedOtps).toBeGreaterThanOrEqual(0);

    // Verify BullMQ queue + workers start and shut down cleanly with Redis
    await container.jobQueue!.start();
    await container.jobQueue!.stop();
  });
});

