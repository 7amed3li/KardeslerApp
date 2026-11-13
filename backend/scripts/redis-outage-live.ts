import { createAppContainer } from '../src/composition-root.js';

async function main() {
  console.log('================================================================');
  console.log('REDIS OUTAGE LIVE VERIFICATION (REDIS IS STOPPED: ECONNREFUSED)');
  console.log('================================================================\n');

  const container = createAppContainer();
  await container.app.ready();

  // 1. GET /readyz (must return 503)
  const readyz = await container.app.inject({ method: 'GET', url: '/readyz' });
  console.log('[1] GET /readyz:');
  console.log(`Status: ${readyz.statusCode}`);
  console.log(`Body: ${readyz.body}\n`);

  // 2. GET /api/v1/menu (public menu, does not use rate limiter, queries DB directly: 200)
  const menu = await container.app.inject({ method: 'GET', url: '/api/v1/menu' });
  console.log('[2] GET /api/v1/menu (Public Menu):');
  console.log(`Status: ${menu.statusCode}`);
  const catCount = JSON.parse(menu.body).categories?.length ?? 0;
  console.log(`Body: { categories: [ ${catCount} categories returned from PostgreSQL ] }\n`);

  // 3. POST /api/v1/auth/customer/otp/request (Customer OTP, fail-closed rate limit: 503)
  const otp = await container.app.inject({
    method: 'POST',
    url: '/api/v1/auth/customer/otp/request',
    payload: { phone: '+905551234567' },
  });
  console.log('[3] POST /api/v1/auth/customer/otp/request (Customer OTP):');
  console.log(`Status: ${otp.statusCode}`);
  console.log(`Body: ${otp.body}\n`);

  // 4. POST /api/v1/auth/staff/login (Staff Login, fail-closed rate limit: 503)
  const staff = await container.app.inject({
    method: 'POST',
    url: '/api/v1/auth/staff/login',
    payload: { email: 'owner@kardeslercihangir.com', password: 'Owner_Password_123!' },
  });
  console.log('[4] POST /api/v1/auth/staff/login (Staff Login):');
  console.log(`Status: ${staff.statusCode}`);
  console.log(`Body: ${staff.body}\n`);

  // 5. POST /api/v1/payments/webhook (Webhook does NOT depend on rate limiter, HMAC verified, idempotent: returns 401 on bad HMAC or 200)
  const webhook = await container.app.inject({
    method: 'POST',
    url: '/api/v1/payments/webhook',
    headers: { 'content-type': 'application/json', 'x-signature': 'bad-hmac-signature-1234567890' },
    payload: JSON.stringify({
      providerEventId: 'evt-outage-01',
      orderId: '00000000-0000-0000-0000-000000000000',
      amountKurus: 1000,
      status: 'failed',
      providerRef: 'iyzico-ref-outage',
      signature: 'bad-hmac-signature-1234567890',
    }),
  });
  console.log('[5] POST /api/v1/payments/webhook (Payments Webhook):');
  console.log(`Status: ${webhook.statusCode}`);
  console.log(`Body: ${webhook.body}\n`);

  // 6. GET /api/v1/realtime/staff (SSE Realtime without ticket: 401)
  const sse = await container.app.inject({
    method: 'GET',
    url: '/api/v1/realtime/staff',
  });
  console.log('[6] GET /api/v1/realtime/staff (SSE Realtime):');
  console.log(`Status: ${sse.statusCode}`);
  console.log(`Body: ${sse.body}\n`);

  // 7. POST /api/v1/orders (Create Order without customer token: 401)
  const order = await container.app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    payload: {
      orderType: 'pickup',
      paymentMethod: 'cash_on_delivery',
      idempotencyKey: 'outage-key-test',
      items: [],
    },
  });
  console.log('[7] POST /api/v1/orders (Create Order):');
  console.log(`Status: ${order.statusCode}`);
  console.log(`Body: ${order.body}\n`);

  // Also verify startup refusal when Redis is down
  console.log('[8] verifyStartup() when Redis is down:');
  try {
    await container.verifyStartup();
    console.log('UNEXPECTED: Allowed boot with dead Redis!');
  } catch (err: any) {
    console.log(`STARTUP REFUSED: ${err.message}\n`);
  }

  await container.shutdown();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
