import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { env } from './config/env.js';
import { closeDbPools, verifyDbSecurityPosture } from './infrastructure/db/client.js';
import { PostgresHealthAdapter } from './infrastructure/db/health.adapter.js';
import { PostgresAuthRepository } from './infrastructure/repositories/auth.repository.js';
import { PostgresAddressRepository, PostgresUserRepository } from './infrastructure/repositories/user-address.repository.js';
import { PostgresDeliveryRepository, PostgresMenuRepository } from './infrastructure/repositories/menu-delivery.repository.js';
import { PostgresCouponRepository, PostgresLoyaltyRepository } from './infrastructure/repositories/coupon-loyalty.repository.js';
import { PostgresOrderRepository } from './infrastructure/repositories/order.repository.js';
import { PostgresPaymentRepository } from './infrastructure/repositories/payment.repository.js';
import { PostgresPrintRepository, PostgresSettingsRepository } from './infrastructure/repositories/print-settings.repository.js';
import { PostgresAdminRepository, PostgresBackgroundJobRepository } from './infrastructure/repositories/admin-jobs.repository.js';
import { JoseTokenService } from './infrastructure/security/jose-token.service.js';
import { NodeCryptoService } from './infrastructure/security/crypto.adapter.js';
import { FakePaymentProvider } from './infrastructure/providers/payment.providers.js';
import { ConsoleSmsProvider } from './infrastructure/providers/sms.providers.js';
import { FakePushProvider } from './infrastructure/providers/push.providers.js';
import { CryptoIdGenerator, SystemClock } from './infrastructure/providers/system-clock.js';
import { createRedisConnection } from './infrastructure/redis/redis-client.js';
import { RedisRateLimiter } from './infrastructure/redis/redis-rate-limiter.js';
import { RedisCacheAdapter, RedisRevokedTokenStore } from './infrastructure/redis/redis-cache-and-tokens.js';
import { RedisEventBus } from './infrastructure/redis/redis-event-bus.js';
import { InMemoryCacheAdapter, InMemoryEventBus, InMemoryRateLimiter, InMemoryRevokedTokenStore } from './infrastructure/redis/in-memory-adapters.js';
import { BullMqJobAdapter } from './infrastructure/jobs/bullmq.adapter.js';
import { AuthUseCases } from './application/auth/auth.use-cases.js';
import { UsersAndAddressesUseCases } from './application/users/users.use-cases.js';
import { MenuAndDeliveryUseCases } from './application/menu/menu.use-cases.js';
import { OrdersUseCases } from './application/orders/orders.use-cases.js';
import { PaymentsUseCases } from './application/payments/payments.use-cases.js';
import { LoyaltyUseCases } from './application/loyalty/loyalty.use-cases.js';
import { PrintAndRealtimeUseCases } from './application/print/print.use-cases.js';
import { AdminUseCases } from './application/admin/admin.use-cases.js';
import { BackgroundJobsUseCases } from './application/jobs/jobs.use-cases.js';
import { HttpAuthHooks } from './http/auth-hooks.js';
import { createHttpServer } from './http/server.js';
import type { PaymentProvider, SmsProvider, TokenServicePort } from './ports/providers.js';
import type { EventBusPort, JobQueuePort, RateLimiterPort, RevokedTokenStorePort } from './ports/state.js';

export interface CompositionOverrides {
  smsProvider?: SmsProvider;
  paymentProvider?: PaymentProvider;
  useInMemoryState?: boolean;
}

export interface AppContainer {
  app: FastifyInstance;
  tokens: TokenServicePort;
  rateLimiter: RateLimiterPort;
  revokedTokens: RevokedTokenStorePort;
  eventBus: EventBusPort;
  jobsUseCases: BackgroundJobsUseCases;
  jobQueue: JobQueuePort | null;
  verifyStartup(): Promise<void>;
  shutdown(): Promise<void>;
}

function buildStateAdapters(useInMemory: boolean) {
  if (useInMemory) {
    return {
      redisClients: [] as Redis[],
      rateLimiter: new InMemoryRateLimiter(),
      cache: new InMemoryCacheAdapter(),
      eventBus: new InMemoryEventBus(),
      revokedTokens: new InMemoryRevokedTokenStore(),
      bullRedis: null as Redis | null,
    };
  }
  const cmd = createRedisConnection(env.REDIS_URL, 'kardesler:', true);
  const sub = createRedisConnection(env.REDIS_URL, 'kardesler:', true);
  const bull = createRedisConnection(env.REDIS_URL, '', false);
  return {
    redisClients: [cmd, sub, bull],
    rateLimiter: new RedisRateLimiter(cmd),
    cache: new RedisCacheAdapter(cmd),
    eventBus: new RedisEventBus(cmd, sub),
    revokedTokens: new RedisRevokedTokenStore(cmd),
    bullRedis: bull,
  };
}

function buildCoreProviders(overrides: CompositionOverrides) {
  const clock = new SystemClock();
  const ids = new CryptoIdGenerator();
  const crypto = new NodeCryptoService(env.OTP_HMAC_SECRET, env.TOTP_ENCRYPTION_KEY);
  const tokens = new JoseTokenService({
    activeKid: env.JWT_KEY_ID,
    previousKid: env.JWT_PREVIOUS_KEY_ID,
    customerSecret: env.JWT_CUSTOMER_SECRET,
    customerPrevSecret: env.JWT_CUSTOMER_PREVIOUS_SECRET,
    staffSecret: env.JWT_STAFF_SECRET,
    staffPrevSecret: env.JWT_STAFF_PREVIOUS_SECRET,
    printSecret: env.JWT_PRINT_SECRET,
    printPrevSecret: env.JWT_PRINT_PREVIOUS_SECRET,
  });
  const payment = overrides.paymentProvider ?? new FakePaymentProvider(env.WEBHOOK_HMAC_SECRET);
  const sms = overrides.smsProvider ?? new ConsoleSmsProvider();
  const push = new FakePushProvider();
  return { clock, ids, crypto, tokens, payment, sms, push };
}

export function createAppContainer(overrides: CompositionOverrides = {}): AppContainer {
  const state = buildStateAdapters(overrides.useInMemoryState ?? false);
  const p = buildCoreProviders(overrides);
  const authRepo = new PostgresAuthRepository();
  const userRepo = new PostgresUserRepository();
  const addrRepo = new PostgresAddressRepository();
  const menuRepo = new PostgresMenuRepository();
  const delivRepo = new PostgresDeliveryRepository();
  const couponRepo = new PostgresCouponRepository();
  const orderRepo = new PostgresOrderRepository();
  const payRepo = new PostgresPaymentRepository();
  const loyalRepo = new PostgresLoyaltyRepository();
  const printRepo = new PostgresPrintRepository();
  const setRepo = new PostgresSettingsRepository();
  const adminRepo = new PostgresAdminRepository();
  const jobsRepo = new PostgresBackgroundJobRepository();

  const auth = new AuthUseCases({
    repo: authRepo, tokens: p.tokens, crypto: p.crypto, sms: p.sms,
    rateLimiter: state.rateLimiter, revokedTokens: state.revokedTokens, clock: p.clock, ids: p.ids,
    allowReviewDemoOtp: env.ALLOW_REVIEW_DEMO_OTP, reviewDemoPhone: env.REVIEW_DEMO_PHONE,
    reviewDemoCode: env.REVIEW_DEMO_OTP_CODE, isTestEnv: env.NODE_ENV === 'test',
  });
  const users = new UsersAndAddressesUseCases(userRepo, addrRepo);
  const menu = new MenuAndDeliveryUseCases(menuRepo, delivRepo, setRepo, state.cache);
  const orders = new OrdersUseCases({
    ordersRepo: orderRepo, menuRepo, deliveryRepo: delivRepo, couponRepo, paymentRepo: payRepo,
    paymentProvider: p.payment, eventBus: state.eventBus, rateLimiter: state.rateLimiter, clock: p.clock,
  });
  const payments = new PaymentsUseCases(payRepo, p.payment, state.eventBus, p.clock);
  const loyalty = new LoyaltyUseCases(loyalRepo);
  const printRt = new PrintAndRealtimeUseCases(printRepo, setRepo, state.eventBus, p.clock);
  const admin = new AdminUseCases(adminRepo, couponRepo, delivRepo, setRepo, p.clock);
  const jobsUseCases = new BackgroundJobsUseCases(jobsRepo, state.eventBus, p.push, p.clock);
  const jobQueue = state.bullRedis ? new BullMqJobAdapter(state.bullRedis, jobsUseCases) : null;
  const authHooks = new HttpAuthHooks(p.tokens, state.revokedTokens);
  const app = createHttpServer({
    nodeEnv: env.NODE_ENV, adminOrigin: env.ADMIN_ORIGIN, dbHealth: new PostgresHealthAdapter(),
    authHooks, auth, users, menu, orders, payments, loyalty, printRt, admin,
  });

  const shutdown = async () => {
    await jobQueue?.stop();
    await app.close();
    await Promise.allSettled(state.redisClients.map((c) => c.quit()));
    await closeDbPools();
  };

  return {
    app, tokens: p.tokens, rateLimiter: state.rateLimiter, revokedTokens: state.revokedTokens,
    eventBus: state.eventBus, jobsUseCases, jobQueue,
    verifyStartup: async () => { await verifyDbSecurityPosture(); },
    shutdown,
  };
}
