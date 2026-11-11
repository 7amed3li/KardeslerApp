import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { MenuAndDeliveryUseCases } from '../../application/menu/menu.use-cases.js';
import type { HttpAuthHooks } from '../auth-hooks.js';
import {
  AdminCreateCategorySchema,
  AdminCreateMenuItemSchema,
  AdminPatchMenuItemSchema,
  AdminUpdateCategorySchema,
  DeliveryCheckSchema,
  UuidParamSchema,
} from '../schemas/api.schemas.js';

function registerPublicCatalogRoutes(app: FastifyInstance, menu: MenuAndDeliveryUseCases, hooks: HttpAuthHooks): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  app.get('/api/v1/menu', async (req, reply) => {
    return reply.status(200).send(await menu.getLocalizedMenu(hooks.resolveLanguage(req)));
  });
  app.get('/api/v1/banners', async (_req, reply) => reply.status(200).send(await menu.getPublicBanners()));
  app.get('/api/v1/settings/public', async (_req, reply) => reply.status(200).send(await menu.getPublicSettings()));
  r.post('/api/v1/delivery/check', { schema: { body: DeliveryCheckSchema } }, async (req, reply) => {
    return reply.status(200).send(await menu.checkDeliveryZone(req.body.lat, req.body.lng));
  });
}

function registerAdminMenuRoutes(app: FastifyInstance, menu: MenuAndDeliveryUseCases, hooks: HttpAuthHooks): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.patch('/api/v1/admin/menu/items/:id', { schema: { params: UuidParamSchema, body: AdminPatchMenuItemSchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await menu.updateMenuItem(owner.sub, req.params.id, req.body));
  });
  r.post('/api/v1/admin/menu/items', { schema: { body: AdminCreateMenuItemSchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(201).send(await menu.createMenuItem(owner.sub, req.body));
  });
  r.delete('/api/v1/admin/menu/items/:id', { schema: { params: UuidParamSchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await menu.deleteMenuItem(owner.sub, req.params.id));
  });
  r.post('/api/v1/admin/menu/categories', { schema: { body: AdminCreateCategorySchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(201).send(await menu.createCategory(owner.sub, req.body));
  });
  r.patch('/api/v1/admin/menu/categories/:id', { schema: { params: UuidParamSchema, body: AdminUpdateCategorySchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await menu.updateCategory(owner.sub, req.params.id, req.body));
  });
}

export function registerMenuRoutes(app: FastifyInstance, menu: MenuAndDeliveryUseCases, hooks: HttpAuthHooks): void {
  registerPublicCatalogRoutes(app, menu, hooks);
  registerAdminMenuRoutes(app, menu, hooks);
}
