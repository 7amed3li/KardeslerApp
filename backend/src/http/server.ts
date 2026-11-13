import fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { registerHttpErrorMapper } from './error-mapper.js';
import type { HttpAuthHooks } from './auth-hooks.js';
import type { AuthUseCases } from '../application/auth/auth.use-cases.js';
import type { UsersAndAddressesUseCases } from '../application/users/users.use-cases.js';
import type { MenuAndDeliveryUseCases } from '../application/menu/menu.use-cases.js';
import type { OrdersUseCases } from '../application/orders/orders.use-cases.js';
import type { PaymentsUseCases } from '../application/payments/payments.use-cases.js';
import type { LoyaltyUseCases } from '../application/loyalty/loyalty.use-cases.js';
import type { PrintAndRealtimeUseCases } from '../application/print/print.use-cases.js';
import type { AdminUseCases } from '../application/admin/admin.use-cases.js';
import type { DbHealthPort } from '../ports/repositories.js';
import { registerHealthRoutes } from './routes/health.routes.js';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerUsersRoutes } from './routes/users.routes.js';
import { registerMenuRoutes } from './routes/menu.routes.js';
import { registerOrderRoutes } from './routes/orders.routes.js';
import { registerPaymentRoutes } from './routes/payments.routes.js';
import { registerStaffAndPrintRoutes } from './routes/staff.routes.js';
import { registerLoyaltyRoutes } from './routes/loyalty.routes.js';
import { registerAdminRoutes } from './routes/admin.routes.js';

export interface HttpServerDeps {
  nodeEnv: string;
  adminOrigin: string;
  dbHealth: DbHealthPort;
  authHooks: HttpAuthHooks;
  auth: AuthUseCases;
  users: UsersAndAddressesUseCases;
  menu: MenuAndDeliveryUseCases;
  orders: OrdersUseCases;
  payments: PaymentsUseCases;
  loyalty: LoyaltyUseCases;
  printRt: PrintAndRealtimeUseCases;
  admin: AdminUseCases;
  onRoute?: (method: string, url: string) => void;
}

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.phone',
  'req.body.code',
  'req.body.totp_code',
  'req.body.totpCode',
  'req.body.refresh_token',
  'req.body.refreshToken',
  'req.body.address_snapshot',
];

function createFastifyBase(deps: HttpServerDeps): FastifyInstance {
  const app = fastify({
    trustProxy: true,
    bodyLimit: 100 * 1024,
    logger: {
      level: deps.nodeEnv === 'test' ? 'silent' : 'info',
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    },
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body: Buffer, done) => {
    (req as any).rawBody = body.toString('utf8');
    try {
      const json = JSON.parse(body.toString('utf8'));
      done(null, json);
    } catch (err: any) {
      done(err, undefined);
    }
  });
  if (deps.onRoute) {
    app.addHook('onRoute', (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      for (const m of methods) {
        if (m !== 'HEAD' && m !== 'OPTIONS' && route.url !== '*') deps.onRoute!(m, route.url);
      }
    });
  }
  app.register(helmet, { contentSecurityPolicy: false });
  app.register(cors, { origin: [deps.adminOrigin, 'http://localhost:3000', 'http://localhost:8081'], credentials: true });
  app.register(cookie);
  app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'Kardeşler Cihangir Ordering API', version: '1.0.0' },
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    },
    transform: jsonSchemaTransform,
  });
  registerHttpErrorMapper(app);
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    return payload;
  });
  return app;
}

export function createHttpServer(deps: HttpServerDeps): FastifyInstance {
  const app = createFastifyBase(deps);
  app.after(() => {
    registerHealthRoutes(app, deps.dbHealth, deps.nodeEnv);
    registerAuthRoutes(app, deps.auth, deps.authHooks);
    registerUsersRoutes(app, deps.users, deps.authHooks);
    registerMenuRoutes(app, deps.menu, deps.authHooks);
    registerOrderRoutes(app, deps.orders, deps.authHooks);
    registerPaymentRoutes(app, deps.payments, deps.authHooks);
    registerStaffAndPrintRoutes(app, deps.orders, deps.printRt, deps.admin, deps.authHooks);
    registerLoyaltyRoutes(app, deps.loyalty, deps.authHooks);
    registerAdminRoutes(app, deps.admin, deps.authHooks);
  });
  return app;
}

