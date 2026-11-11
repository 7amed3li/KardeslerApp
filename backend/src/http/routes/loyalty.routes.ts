import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { LoyaltyUseCases } from '../../application/loyalty/loyalty.use-cases.js';
import type { HttpAuthHooks } from '../auth-hooks.js';
import { ConsentCreateSchema, ReviewCreateSchema } from '../schemas/api.schemas.js';

export function registerLoyaltyRoutes(
  app: FastifyInstance,
  loyalty: LoyaltyUseCases,
  hooks: HttpAuthHooks,
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  app.get('/api/v1/loyalty/me', async (request, reply) => {
    const customer = await hooks.requireCustomer(request);
    return reply.status(200).send(await loyalty.getMyLoyalty(customer.sub));
  });

  r.post(
    '/api/v1/reviews',
    { schema: { body: ReviewCreateSchema } },
    async (request, reply) => {
      const customer = await hooks.requireCustomer(request);
      return reply.status(201).send(await loyalty.createReview(customer.sub, request.body));
    },
  );

  r.post(
    '/api/v1/consents',
    { schema: { body: ConsentCreateSchema } },
    async (request, reply) => {
      const customer = await hooks.requireCustomer(request);
      return reply.status(201).send(await loyalty.recordConsent(customer.sub, request.body));
    },
  );
}
