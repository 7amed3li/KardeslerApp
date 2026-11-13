import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PaymentsUseCases } from '../../application/payments/payments.use-cases.js';
import type { HttpAuthHooks } from '../auth-hooks.js';
import { UuidParamSchema, WebhookBodySchema } from '../schemas/api.schemas.js';

export function registerPaymentRoutes(
  app: FastifyInstance,
  payments: PaymentsUseCases,
  hooks: HttpAuthHooks,
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Payment webhook endpoint: HMAC signature verified using raw payload and timingSafeEqual
  r.post('/api/v1/payments/webhook', { schema: { body: WebhookBodySchema } }, async (req, reply) => {
    const rawBody = (req as any).rawBody ?? JSON.stringify(req.body);
    const signatureHeader = (req.headers['x-signature'] ?? req.headers['x-iyzico-signature']) as string | undefined;
    return reply.status(200).send(await payments.processWebhook({
      ...req.body,
      rawBody,
      signatureHeader,
    }));
  });

  // Hosted payment session creation for awaiting_payment orders
  r.post('/api/v1/orders/:id/payment-session', { schema: { params: UuidParamSchema } }, async (req, reply) => {
    const customer = await hooks.requireCustomer(req);
    return reply.status(200).send(await payments.createPaymentSession(customer.sub, req.params.id));
  });
}

