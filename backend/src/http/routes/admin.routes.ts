import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AdminUseCases } from '../../application/admin/admin.use-cases.js';
import type { HttpAuthHooks } from '../auth-hooks.js';
import {
  AdminCreateBannerSchema,
  AdminCreateCouponSchema,
  AdminCreateDriverSchema,
  AdminCreateStaffSchema,
  AdminCreateZoneSchema,
  AdminUpdateCouponSchema,
  AdminUpdateDriverSchema,
  AdminUpdateSettingsSchema,
  AdminUpdateStaffSchema,
  AdminUpdateZoneSchema,
  UuidParamSchema,
} from '../schemas/api.schemas.js';

const DailyQuerySchema = z.object({ businessDate: z.string().optional() }).strict();

function registerReportingAndCouponRoutes(app: FastifyInstance, admin: AdminUseCases, hooks: HttpAuthHooks): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/api/v1/admin/reports/daily-summary', { schema: { querystring: DailyQuerySchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await admin.getDailySummary(owner.sub, req.query.businessDate));
  });
  app.get('/api/v1/admin/audit-logs', async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await admin.getAuditLogs(owner.sub));
  });
  app.get('/api/v1/admin/coupons', async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await admin.listCoupons(owner.sub));
  });
  r.post('/api/v1/admin/coupons', { schema: { body: AdminCreateCouponSchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(201).send(await admin.createCoupon(owner.sub, req.body));
  });
  r.patch('/api/v1/admin/coupons/:id', { schema: { params: UuidParamSchema, body: AdminUpdateCouponSchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await admin.updateCoupon(owner.sub, req.params.id, req.body));
  });
}

function registerFleetRoutes(app: FastifyInstance, admin: AdminUseCases, hooks: HttpAuthHooks): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  app.get('/api/v1/admin/zones', async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await admin.listZones(owner.sub));
  });
  r.post('/api/v1/admin/zones', { schema: { body: AdminCreateZoneSchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(201).send(await admin.createZone(owner.sub, req.body));
  });
  r.patch('/api/v1/admin/zones/:id', { schema: { params: UuidParamSchema, body: AdminUpdateZoneSchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await admin.updateZone(owner.sub, req.params.id, req.body));
  });
  r.delete('/api/v1/admin/zones/:id', { schema: { params: UuidParamSchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await admin.deleteZone(owner.sub, req.params.id));
  });
  app.get('/api/v1/admin/drivers', async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await admin.listDrivers(owner.sub));
  });
  r.post('/api/v1/admin/drivers', { schema: { body: AdminCreateDriverSchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(201).send(await admin.createDriver(owner.sub, req.body));
  });
  r.patch('/api/v1/admin/drivers/:id', { schema: { params: UuidParamSchema, body: AdminUpdateDriverSchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await admin.updateDriver(owner.sub, req.params.id, req.body));
  });
}

function registerGovernanceRoutes(app: FastifyInstance, admin: AdminUseCases, hooks: HttpAuthHooks): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  app.get('/api/v1/admin/staff', async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await admin.listStaff(owner.sub));
  });
  r.post('/api/v1/admin/staff', { schema: { body: AdminCreateStaffSchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(201).send(await admin.createStaff(owner.sub, req.body));
  });
  r.patch('/api/v1/admin/staff/:id', { schema: { params: UuidParamSchema, body: AdminUpdateStaffSchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await admin.updateStaff(owner.sub, req.params.id, req.body));
  });
  r.post('/api/v1/admin/staff/:id/reset-2fa', { schema: { params: UuidParamSchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await admin.resetStaff2FA(owner.sub, req.params.id));
  });
  app.get('/api/v1/admin/fraud-flags', async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await admin.listFraudFlags(owner.sub));
  });
  r.post('/api/v1/admin/fraud-flags/:id/resolve', { schema: { params: UuidParamSchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await admin.resolveFraudFlag(owner.sub, req.params.id));
  });
  app.get('/api/v1/admin/banners', async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await admin.listBanners(owner.sub));
  });
  r.post('/api/v1/admin/banners', { schema: { body: AdminCreateBannerSchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(201).send(await admin.createBanner(owner.sub, req.body));
  });
  r.patch('/api/v1/admin/settings', { schema: { body: AdminUpdateSettingsSchema } }, async (req, reply) => {
    const owner = await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await admin.updateSettings(owner.sub, req.body));
  });
}

export function registerAdminRoutes(app: FastifyInstance, admin: AdminUseCases, hooks: HttpAuthHooks): void {
  registerReportingAndCouponRoutes(app, admin, hooks);
  registerFleetRoutes(app, admin, hooks);
  registerGovernanceRoutes(app, admin, hooks);
}
