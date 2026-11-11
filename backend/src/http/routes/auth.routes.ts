import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AuthUseCases } from '../../application/auth/auth.use-cases.js';
import type { HttpAuthHooks } from '../auth-hooks.js';
import {
  LogoutBodySchema,
  OtpRequestBodySchema,
  OtpVerifyBodySchema,
  PrintAgentTokenIssueSchema,
  PrintAgentTokenRevokeSchema,
  RefreshTokenBodySchema,
  StaffLoginBodySchema,
  TotpSetupBodySchema,
  TotpVerifySetupBodySchema,
} from '../schemas/api.schemas.js';

function registerCustomerAuthRoutes(app: FastifyInstance, auth: AuthUseCases, hooks: HttpAuthHooks): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.post('/api/v1/auth/customer/otp/request', { schema: { body: OtpRequestBodySchema } }, async (req, reply) => {
    const res = await auth.requestCustomerOtp(req.body.phone, req.ip);
    return reply.status(200).send({ message: 'Doğrulama kodu gönderildi', ...res });
  });
  r.post('/api/v1/auth/customer/otp/verify', { schema: { body: OtpVerifyBodySchema } }, async (req, reply) => {
    return reply.status(200).send(await auth.verifyCustomerOtp(req.body.phone, req.body.code, req.ip, req.headers['user-agent']));
  });
  r.post('/api/v1/auth/customer/refresh', { schema: { body: RefreshTokenBodySchema } }, async (req, reply) => {
    return reply.status(200).send(await auth.rotateRefreshToken(req.body.refreshToken, req.ip, req.headers['user-agent']));
  });
  app.post('/api/v1/auth/customer/logout', async (req, reply) => {
    const customer = await hooks.requireCustomer(req);
    const parsed = LogoutBodySchema.parse(req.body);
    await auth.logoutCustomer(customer.sub, parsed?.refreshToken);
    return reply.status(200).send({ success: true });
  });
}

function registerStaffAndPrintAuthRoutes(app: FastifyInstance, auth: AuthUseCases, hooks: HttpAuthHooks): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.post('/api/v1/auth/staff/login', { schema: { body: StaffLoginBodySchema } }, async (req, reply) => {
    return reply.status(200).send(await auth.loginStaff(req.body.email, req.body.password, req.body.totpCode));
  });
  r.post('/api/v1/auth/staff/totp/setup', { schema: { body: TotpSetupBodySchema } }, async (req, reply) => {
    return reply.status(200).send(await auth.setupStaffTotp(req.body.setupToken));
  });
  r.post('/api/v1/auth/staff/totp/verify-setup', { schema: { body: TotpVerifySetupBodySchema } }, async (req, reply) => {
    return reply.status(200).send(await auth.verifySetupStaffTotp(req.body.setupToken, req.body.secret, req.body.totpCode));
  });
  r.post('/api/v1/print-agent/token', { schema: { body: PrintAgentTokenIssueSchema } }, async (req, reply) => {
    await hooks.requireStaff(req, ['owner']);
    return reply.status(201).send(await auth.issuePrintAgentToken(req.body.deviceId));
  });
  r.post('/api/v1/print-agent/token/revoke', { schema: { body: PrintAgentTokenRevokeSchema } }, async (req, reply) => {
    await hooks.requireStaff(req, ['owner']);
    return reply.status(200).send(await auth.revokePrintAgentToken(req.body.jti));
  });
}

export function registerAuthRoutes(app: FastifyInstance, auth: AuthUseCases, hooks: HttpAuthHooks): void {
  registerCustomerAuthRoutes(app, auth, hooks);
  registerStaffAndPrintAuthRoutes(app, auth, hooks);
}
