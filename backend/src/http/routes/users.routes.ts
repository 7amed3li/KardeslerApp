import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { UsersAndAddressesUseCases } from '../../application/users/users.use-cases.js';
import type { HttpAuthHooks } from '../auth-hooks.js';
import {
  CreateAddressSchema,
  RegisterDeviceSchema,
  UpdateAddressSchema,
  UpdateMeSchema,
  UuidParamSchema,
} from '../schemas/api.schemas.js';

function registerProfileRoutes(app: FastifyInstance, users: UsersAndAddressesUseCases, hooks: HttpAuthHooks): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  app.delete('/api/v1/users/me', async (req, reply) => {
    const c = await hooks.requireCustomer(req);
    return reply.status(200).send(await users.anonymizeMe(c.sub));
  });
  r.patch('/api/v1/users/me', { schema: { body: UpdateMeSchema } }, async (req, reply) => {
    const c = await hooks.requireCustomer(req);
    return reply.status(200).send({ user: await users.updateMe(c.sub, req.body) });
  });
  r.post('/api/v1/devices', { schema: { body: RegisterDeviceSchema } }, async (req, reply) => {
    const c = await hooks.requireCustomer(req);
    return reply.status(201).send({ device: await users.registerDevice(c.sub, req.body) });
  });
  app.get('/api/v1/referrals/me', async (req, reply) => {
    const c = await hooks.requireCustomer(req);
    return reply.status(200).send(await users.getReferrals(c.sub));
  });
}

function registerAddressRoutes(app: FastifyInstance, users: UsersAndAddressesUseCases, hooks: HttpAuthHooks): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  app.get('/api/v1/addresses', async (req, reply) => {
    const c = await hooks.requireCustomer(req);
    return reply.status(200).send(await users.listAddresses(c.sub));
  });
  r.post('/api/v1/addresses', { schema: { body: CreateAddressSchema } }, async (req, reply) => {
    const c = await hooks.requireCustomer(req);
    return reply.status(201).send(await users.createAddress(c.sub, req.body));
  });
  r.patch('/api/v1/addresses/:id', { schema: { params: UuidParamSchema, body: UpdateAddressSchema } }, async (req, reply) => {
    const c = await hooks.requireCustomer(req);
    return reply.status(200).send(await users.updateAddress(c.sub, req.params.id, req.body));
  });
  r.delete('/api/v1/addresses/:id', { schema: { params: UuidParamSchema } }, async (req, reply) => {
    const c = await hooks.requireCustomer(req);
    return reply.status(200).send(await users.deleteAddress(c.sub, req.params.id));
  });
}

export function registerUsersRoutes(app: FastifyInstance, users: UsersAndAddressesUseCases, hooks: HttpAuthHooks): void {
  registerProfileRoutes(app, users, hooks);
  registerAddressRoutes(app, users, hooks);
}
