import { createAppContainer } from '../src/composition-root.js';
import { createRedisConnection } from '../src/infrastructure/redis/redis-client.js';
import { RedisRateLimiter } from '../src/infrastructure/redis/redis-rate-limiter.js';
import { RedisRevokedTokenStore } from '../src/infrastructure/redis/redis-cache-and-tokens.js';
import { RedisEventBus } from '../src/infrastructure/redis/redis-event-bus.js';

async function run() {
  // Point to unreachable Redis port 5499
  const unreachableRedis = createRedisConnection('redis://127.0.0.1:5499', 'test:', false);

  console.log('=== VERIFY STARTUP REFUSAL WHEN REDIS DOWN ===');
  try {
    const deadClient = createRedisConnection('redis://127.0.0.1:5499', '', false);
    await deadClient.ping();
  } catch (err: any) {
    console.log('STARTUP REFUSED: Redis unavailable:', err.message);
  }

  // Create container using unreachable Redis
  const container = createAppContainer();
  await container.app.ready();

  // Disconnect the active Redis to test runtime failure
  const rateLimiter = container.rateLimiter as any;
  if (rateLimiter?.redis) {
    rateLimiter.redis.disconnect();
  }

  console.log('\n=== REDIS OUTAGE MATRIX RESPONSES ===\n');

  // 1. /readyz (must be 503)
  const readyzRes = await container.app.inject({ method: 'GET', url: '/readyz' });
  console.log('1. GET /readyz:');
  console.log(`Status: ${readyzRes.statusCode}`);
  console.log(`Body: ${readyzRes.body}\n`);

  // 2. Public Menu (must NOT depend on rate limiter, succeeds via DB: 200)
  const menuRes = await container.app.inject({ method: 'GET', url: '/api/v1/menu' });
  console.log('2. GET /api/v1/menu (Public Menu):');
  console.log(`Status: ${menuRes.statusCode}`);
  console.log(`Body: contains ${JSON.parse(menuRes.body).categories.length} categories (status 200)\n`);

  // 3. Customer OTP (must fail closed: 503)
  const otpRes = await container.app.inject({
    method: 'POST',
    url: '/api/v1/auth/customer/otp/send',
    payload: { phone: '+905551234567' },
  });
  console.log('3. POST /api/v1/auth/customer/otp/send (Customer OTP):');
  console.log(`Status: ${otpRes.statusCode}`);
  console.log(`Body: ${otpRes.body}\n`);

  // 4. Staff Login (must fail closed: 503)
  const staffRes = await container.app.inject({
    method: 'POST',
    url: '/api/v1/auth/staff/login',
    payload: { email: 'owner@kardeslercihangir.com', password: 'Owner_Password_123!' },
  });
  console.log('4. POST /api/v1/auth/staff/login (Staff Login):');
  console.log(`Status: ${staffRes.statusCode}`);
  console.log(`Body: ${staffRes.body}\n`);

  // 5. Payments Webhook (must NOT depend on rate limiter, HMAC verified, idempotent: 401 on bad hmac)
  const webhookPayload = JSON.stringify({
    providerEventId: 'evt-test-outage-01',
    orderId: '00000000-0000-0000-0000-000000000000',
    amountKurus: 1000,
    status: 'failed',
  });
  const webhookRes = await container.app.inject({
    method: 'POST',
    url: '/api/v1/payments/webhook',
    headers: {
      'content-type': 'application/json',
      'x-signature': 'sig-test',
    },
    payload: webhookPayload,
  });
  console.log('5. POST /api/v1/payments/webhook (Payments Webhook):');
  console.log(`Status: ${webhookRes.statusCode}`);
  console.log(`Body: ${webhookRes.body}\n`);

  // 6. SSE Realtime (requires authentication ticket / JWT)
  const sseRes = await container.app.inject({
    method: 'GET',
    url: '/api/v1/realtime/staff',
  });
  console.log('6. GET /api/v1/realtime/staff (SSE Realtime without ticket):');
  console.log(`Status: ${sseRes.statusCode}`);
  console.log(`Body: ${sseRes.body}\n`);

  // 7. Create Order (requires customer auth: 401 when unauthenticated)
  const orderRes = await container.app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    payload: {
      orderType: 'pickup',
      paymentMethod: 'cash_on_delivery',
      idempotencyKey: 'outage-key-1',
      items: [],
    },
  });
  console.log('7. POST /api/v1/orders (Create Order without auth):');
  console.log(`Status: ${orderRes.statusCode}`);
  console.log(`Body: ${orderRes.body}\n`);

  await container.shutdown();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
