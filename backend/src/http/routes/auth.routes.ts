import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AuthUseCases } from '../../application/auth/auth.use-cases.js';
import type { HttpAuthHooks } from '../auth-hooks.js';
import {
  GoogleExchangeBodySchema,
  GoogleLinkBodySchema,
  LogoutBodySchema,
  OtpRequestBodySchema,
  OtpVerifyBodySchema,
  PrintAgentTokenIssueSchema,
  PrintAgentTokenRevokeSchema,
  RefreshTokenBodySchema,
  StaffLoginBodySchema,
  StaffRefreshTokenBodySchema,
  TotpSetupBodySchema,
  TotpVerifySetupBodySchema,
  UnlinkIdentityParamsSchema,
} from '../schemas/api.schemas.js';

function registerCustomerAuthRoutes(app: FastifyInstance, auth: AuthUseCases, hooks: HttpAuthHooks): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.post('/api/v1/auth/customer/google/exchange', { schema: { body: GoogleExchangeBodySchema } }, async (req, reply) => {
    return reply.status(200).send(await auth.exchangeGoogleCode(req.body, req.ip, req.headers['user-agent']));
  });
  r.post('/api/v1/auth/customer/google/link', { schema: { body: GoogleLinkBodySchema } }, async (req, reply) => {
    const customer = await hooks.requireCustomer(req);
    return reply.status(200).send(await auth.linkGoogleAccount(customer.sub, req.body));
  });
  app.get('/api/v1/auth/customer/identities', async (req, reply) => {
    const customer = await hooks.requireCustomer(req);
    const identities = await auth.listIdentities(customer.sub);
    return reply.status(200).send({ identities });
  });
  r.delete('/api/v1/auth/customer/identities/:provider', { schema: { params: UnlinkIdentityParamsSchema } }, async (req, reply) => {
    const customer = await hooks.requireCustomer(req);
    return reply.status(200).send(await auth.unlinkIdentity(customer.sub, req.params.provider));
  });
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
  r.post('/api/v1/auth/staff/refresh', { schema: { body: StaffRefreshTokenBodySchema } }, async (req, reply) => {
    return reply.status(200).send(await auth.refreshStaffToken(req.body.refreshToken));
  });
  app.post('/api/v1/auth/staff/logout', async (req, reply) => {
    const staff = await hooks.requireStaff(req, ['staff', 'owner']);
    return reply.status(200).send(await auth.logoutStaff(staff.kid ?? staff.sub));
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
