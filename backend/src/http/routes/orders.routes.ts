import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { OrdersUseCases } from '../../application/orders/orders.use-cases.js';
import type { PaymentsUseCases } from '../../application/payments/payments.use-cases.js';
import type { HttpAuthHooks } from '../auth-hooks.js';
import {
  CancelOrderBodySchema,
  CreateOrderBodySchema,
  QuoteRequestSchema,
  UuidParamSchema,
  WebhookBodySchema,
} from '../schemas/api.schemas.js';

function registerQuoteAndCreateRoutes(app: FastifyInstance, orders: OrdersUseCases, hooks: HttpAuthHooks): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const quoteHandler = async (req: { body: any }, reply: any) => reply.status(200).send(await orders.quoteCart(req.body));
  r.post('/api/v1/orders/quote', { schema: { body: QuoteRequestSchema } }, quoteHandler);
  r.post('/api/v1/cart/price', { schema: { body: QuoteRequestSchema } }, quoteHandler);
  app.post('/api/v1/orders', async (req, reply) => {
    const customer = await hooks.requireCustomer(req);
    const headerKey = req.headers['idempotency-key'];
    const rawBody = (req.body ?? {}) as Record<string, unknown>;
    const merged = {
      ...rawBody,
      idempotency_key: typeof headerKey === 'string' && headerKey.length >= 8 ? headerKey : rawBody.idempotency_key,
    };
    return reply.status(201).send(await orders.createOrder(customer.sub, CreateOrderBodySchema.parse(merged)));
  });
}

function registerOrderHistoryAndWebhookRoutes(
  app: FastifyInstance,
  orders: OrdersUseCases,
  payments: PaymentsUseCases,
  hooks: HttpAuthHooks,
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  app.get('/api/v1/orders', async (req, reply) => {
    const c = await hooks.requireCustomer(req);
    return reply.status(200).send(await orders.listCustomerOrders(c.sub));
  });
  r.get('/api/v1/orders/:id', { schema: { params: UuidParamSchema } }, async (req, reply) => {
    const c = await hooks.requireCustomer(req);
    return reply.status(200).send(await orders.getCustomerOrderDetail(c.sub, req.params.id));
  });
  r.post('/api/v1/orders/:id/cancel', { schema: { params: UuidParamSchema } }, async (req, reply) => {
    const c = await hooks.requireCustomer(req);
    return reply.status(200).send(await orders.cancelCustomerOrder(c.sub, req.params.id, CancelOrderBodySchema.parse(req.body)?.reason));
  });
  r.post('/api/v1/orders/:id/reorder', { schema: { params: UuidParamSchema } }, async (req, reply) => {
    const c = await hooks.requireCustomer(req);
    return reply.status(200).send(await orders.reorderPreview(c.sub, req.params.id));
  });
  r.post('/api/v1/payments/webhook', { schema: { body: WebhookBodySchema } }, async (req, reply) => {
    return reply.status(200).send(await payments.processWebhook(req.body));
  });
}

export function registerOrderRoutes(
  app: FastifyInstance,
  orders: OrdersUseCases,
  payments: PaymentsUseCases,
  hooks: HttpAuthHooks,
): void {
  registerQuoteAndCreateRoutes(app, orders, hooks);
  registerOrderHistoryAndWebhookRoutes(app, orders, payments, hooks);
}
