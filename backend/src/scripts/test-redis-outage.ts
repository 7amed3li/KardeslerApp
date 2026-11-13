import type { FastifyInstance } from 'fastify';
import { createAppContainer } from '../composition-root.js';
import { execSync } from 'node:child_process';
import { env } from '../config/env.js';
import { computeWebhookHmac } from '../infrastructure/providers/payment.providers.js';

async function testPublicAndAuthRoutes(app: FastifyInstance): Promise<void> {
  const menuRes = await app.inject({ method: 'GET', url: '/api/v1/menu' });
  console.log('1. [Public Menu] GET /api/v1/menu:');
  console.log(`   Status: ${menuRes.statusCode}`);
  console.log(`   Body preview: categories=${menuRes.json().categories?.length ?? 0}`);

  const otpRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/customer/otp/request',
    payload: { phone: '+905321112233' },
  });
  console.log('\n2. [Customer OTP] POST /api/v1/auth/customer/otp/request:');
  console.log(`   Status: ${otpRes.statusCode}`);
  console.log(`   Body: ${otpRes.body}`);

  const staffRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/staff/login',
    payload: { email: 'staff@kardeslercihangir.com', password: 'password123' },
  });
  console.log('\n3. [Staff Login] POST /api/v1/auth/staff/login:');
  console.log(`   Status: ${staffRes.statusCode}`);
  console.log(`   Body: ${staffRes.body}`);
}

async function testOrderWebhookAndRealtimeRoutes(
  app: FastifyInstance,
  customerToken: string,
  staffToken: string,
): Promise<void> {
  const orderRes = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    headers: { authorization: `Bearer ${customerToken}`, 'idempotency-key': 'outage-key-12345' },
    payload: {
      order_type: 'pickup',
      payment_method: 'cash_on_delivery',
      items: [{ menu_item_id: 'f0000000-0000-0000-0000-000000000001', quantity: 1, option_ids: [] }],
    },
  });
  console.log('\n4. [Create Order] POST /api/v1/orders:');
  console.log(`   Status: ${orderRes.statusCode}`);
  console.log(`   Body: ${orderRes.body}`);

  const whEventId = `outage_evt_${Date.now()}`;
  const whOrderId = '00000000-0000-0000-0000-000000000000';
  const whSig = computeWebhookHmac(whEventId, whOrderId, 1000, 'paid', env.WEBHOOK_HMAC_SECRET);
  const webhookRes = await app.inject({
    method: 'POST',
    url: '/api/v1/payments/webhook',
    payload: {
      providerEventId: whEventId,
      orderId: whOrderId,
      amountKurus: 1000,
      status: 'paid',
      providerRef: 'ref_1',
      signature: whSig,
    },
  });
  console.log('\n5. [Payment Webhook] POST /api/v1/payments/webhook:');
  console.log(`   Status: ${webhookRes.statusCode}`);
  console.log(`   Body: ${webhookRes.body}`);

  const sseRes = await app.inject({
    method: 'GET',
    url: '/api/v1/realtime/staff',
    headers: { authorization: `Bearer ${staffToken}` },
  });
  console.log('\n6. [SSE Realtime] GET /api/v1/realtime/staff:');
  console.log(`   Status: ${sseRes.statusCode}`);
  console.log(`   Body: ${sseRes.body}`);

  const readyzRes = await app.inject({ method: 'GET', url: '/readyz' });
  console.log('\n7. [Readiness Probe] GET /readyz:');
  console.log(`   Status: ${readyzRes.statusCode}`);
  console.log(`   Body: ${readyzRes.body}`);
}

async function run(): Promise<void> {
  console.log('=== STEP 1: INITIALIZING FULL APP CONTAINER WITH REDIS 7 ===');
  const container = createAppContainer();
  const app = container.app;
  await app.ready();

  const customerToken = (await container.tokens.signCustomerToken('11111111-2222-4333-8444-555555555555')).accessToken;
  const staffToken = (await container.tokens.signStaffToken('a0000000-0000-0000-0000-000000000001', 'staff')).accessToken;

  console.log('\n=== STEP 2: SHUTTING DOWN REDIS DAEMON ===');
  try {
    execSync('wsl -d docker-desktop -u root -- redis-cli shutdown nosave', { stdio: 'pipe' });
  } catch {
    // Already shut down
  }
  await new Promise((r) => setTimeout(r, 800));

  console.log('\n=== STEP 3: EXECUTING ROUTE MATRIX UNDER REDIS OUTAGE ===\n');
  await testPublicAndAuthRoutes(app);
  await testOrderWebhookAndRealtimeRoutes(app, customerToken, staffToken);

  console.log('\n=== STEP 4: RESTARTING REDIS DAEMON ===');
  execSync('wsl -d docker-desktop -u root -- redis-server --daemonize yes', { stdio: 'inherit' });
  await new Promise((r) => setTimeout(r, 500));
  console.log('Redis revived successfully.');

  await container.shutdown();
  process.exit(0);
}

void run();
