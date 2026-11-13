import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { OrdersUseCases } from '../../application/orders/orders.use-cases.js';
import type { PrintAndRealtimeUseCases } from '../../application/print/print.use-cases.js';
import type { AdminUseCases } from '../../application/admin/admin.use-cases.js';
import type { HttpAuthHooks } from '../auth-hooks.js';
import {
  AssignDriverSchema,
  HeartbeatSchema,
  OrderSearchQuerySchema,
  PauseOrdersSchema,
  PrintAckSchema,
  StaffOrderStatusSchema,
  UuidParamSchema,
} from '../schemas/api.schemas.js';

function registerStaffOrderOpsRoutes(app: FastifyInstance, orders: OrdersUseCases, admin: AdminUseCases, hooks: HttpAuthHooks): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  app.get('/api/v1/staff/orders', async (req, reply) => {
    const staff = await hooks.requireStaff(req, ['staff', 'owner']);
    return reply.status(200).send(await orders.listStaffOrders(staff.sub, staff.role));
  });
  r.get('/api/v1/staff/orders/search', { schema: { querystring: OrderSearchQuerySchema } }, async (req, reply) => {
    const staff = await hooks.requireStaff(req, ['staff', 'owner']);
    return reply.status(200).send(await orders.searchStaffOrders(staff.sub, staff.role, req.query.query));
  });
  const statusHandler = async (req: { params: { id: string }; body: any } & any, reply: any) => {
    const staff = await hooks.requireStaff(req, ['staff', 'owner']);
    return reply.status(200).send(await orders.transitionOrderAsStaff(staff.sub, staff.role, req.params.id, req.body.status, req.body.cancel_reason));
  };
  r.post('/api/v1/staff/orders/:id/status', { schema: { params: UuidParamSchema, body: StaffOrderStatusSchema } }, statusHandler);
  r.post('/api/v1/staff/orders/:id/driver', { schema: { params: UuidParamSchema, body: AssignDriverSchema } }, async (req, reply) => {
    const staff = await hooks.requireStaff(req, ['staff', 'owner']);
    return reply.status(200).send(await orders.assignDriver(staff.sub, staff.role, req.params.id, req.body.driverId));
  });
  r.post('/api/v1/staff/orders/:id/reprint', { schema: { params: UuidParamSchema } }, async (req, reply) => {
    const staff = await hooks.requireStaff(req, ['staff', 'owner']);
    return reply.status(201).send(await orders.createReprintJob(staff.sub, staff.role, req.params.id));
  });
  r.post('/api/v1/staff/settings/pause', { schema: { body: PauseOrdersSchema } }, async (req, reply) => {
    const staff = await hooks.requireStaff(req, ['staff', 'owner']);
    return reply.status(200).send(await admin.setAcceptingOrders(staff.sub, staff.role, req.body.isAcceptingOrders));
  });
}

function registerPrintAndRealtimeRoutes(app: FastifyInstance, printRt: PrintAndRealtimeUseCases, hooks: HttpAuthHooks): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  app.post('/api/v1/staff/realtime/ticket', async (req, reply) => {
    const staff = await hooks.requireStaff(req, ['staff', 'owner']);
    return reply.status(200).send(await printRt.issueRealtimeTicket(staff.sub, staff.role));
  });
  app.get('/api/v1/realtime/staff', async (req, reply) => {
    await hooks.requireStaff(req, ['staff', 'owner']);
    const raw = req.headers['last-event-id'];
    const lastId = typeof raw === 'string' ? parseInt(raw, 10) : undefined;
    if (req.headers['x-sse-mode'] === 'snapshot') return reply.status(200).send(await printRt.getEventSnapshot(lastId));
    const unsub = await printRt.subscribeStaffEvents((evt) => {
      if (!reply.raw.writableEnded) reply.raw.write(`id: ${evt.id}\nevent: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
    }, lastId);
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    reply.raw.write(': connected\n\n');
    req.raw.on('close', unsub);
  });
  app.get('/api/v1/print-agent/jobs/poll', async (req, reply) => {
    const agent = await hooks.requirePrintAgent(req);
    return reply.status(200).send(await printRt.pollPendingJobs(agent.sub));
  });
  r.post('/api/v1/print-agent/jobs/:id/ack', { schema: { params: UuidParamSchema, body: PrintAckSchema } }, async (req, reply) => {
    await hooks.requirePrintAgent(req);
    return reply.status(200).send(await printRt.ackPrintJob(req.params.id, req.body.status, req.body.error));
  });
  r.post('/api/v1/heartbeats', { schema: { body: HeartbeatSchema } }, async (req, reply) => {
    const staff = await hooks.requireStaff(req, ['staff', 'owner']);
    return reply.status(200).send(await printRt.recordHeartbeat(staff.sub, staff.role, req.body));
  });
}

export function registerStaffAndPrintRoutes(
  app: FastifyInstance,
  orders: OrdersUseCases,
  printRt: PrintAndRealtimeUseCases,
  admin: AdminUseCases,
  hooks: HttpAuthHooks,
): void {
  registerStaffOrderOpsRoutes(app, orders, admin, hooks);
  registerPrintAndRealtimeRoutes(app, printRt, hooks);
}
