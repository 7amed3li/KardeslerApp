import fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { env } from './config/env.js';
import {
  withRlsTx,
  readonlyClient,
  apiClient,
  schema,
  verifyDbSecurityPosture,
  closeDbPools,
} from './db/index.js';
import { AppError, registerGlobalErrorHandler } from './common/errors.js';
import {
  rateLimiter,
  requireCustomer,
  requireStaff,
  requirePrintAgent,
  resolveLanguage,
} from './common/security.js';
import { AuthService, ConsoleSmsProvider, type SmsProvider } from './modules/auth/auth.service.js';
import { PaymentService } from './modules/payments/payment.service.js';
import { ThermalTicketService } from './modules/print/thermal-ticket.service.js';
import { realtimeBroker } from './modules/realtime/realtime.service.js';
import {
  OtpRequestSchema,
  OtpVerifySchema,
  CreateOrderSchema,
  CartItemSchema,
  ORDER_STATUSES,
  VALID_ALLERGENS,
} from '@kardesler/shared';

export interface BuildAppOptions {
  smsProvider?: SmsProvider;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = fastify({
    trustProxy: true,
    bodyLimit: 100 * 1024, // 100 KB strict payload cap
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
      redact: {
        paths: [
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
        ],
        censor: '[REDACTED]',
      },
    },
  });

  app.register(helmet, { contentSecurityPolicy: false });
  app.register(cors, {
    origin: [env.ADMIN_ORIGIN, 'http://localhost:3000', 'http://localhost:8081'],
    credentials: true,
  });
  app.register(cookie);

  registerGlobalErrorHandler(app);

  // Attach X-Request-Id header to every response
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    return payload;
  });

  const smsProvider = options.smsProvider ?? new ConsoleSmsProvider();

  // Localized menu cache (invalidated on any admin/staff menu change)
  const menuCache = new Map<string, { expiresAt: number; data: unknown }>();
  const invalidateMenuCache = () => menuCache.clear();

  // ==========================================================================
  // PHASE 1: HEALTH, READINESS & OPENAPI DOCS
  // ==========================================================================
  app.get('/health', async () => ({
    status: 'ok',
    service: 'kardesler-backend',
    timestamp: new Date().toISOString(),
  }));

  app.get('/healthz', async () => ({
    status: 'ok',
    service: 'kardesler-backend',
    timestamp: new Date().toISOString(),
  }));

  app.get('/readyz', async (_request, reply) => {
    try {
      const posture = await verifyDbSecurityPosture();
      return reply.status(200).send({
        status: 'ready',
        dbRoles: {
          api: posture.api.roleName,
          readonly: posture.readonly.roleName,
        },
        securityPosture: {
          api: {
            isSuperuser: posture.api.isSuperuser,
            bypassRls: posture.api.bypassRls,
            ownedPublicTables: posture.api.ownedPublicTables,
          },
          readonly: {
            isSuperuser: posture.readonly.isSuperuser,
            bypassRls: posture.readonly.bypassRls,
            ownedPublicTables: posture.readonly.ownedPublicTables,
          },
        },
      });
    } catch {
      return reply.status(503).send({ status: 'not_ready' });
    }
  });

  app.get('/docs', async (_request, reply) => {
    if (env.NODE_ENV === 'production') {
      throw new AppError('NOT_FOUND', 404, 'Not found');
    }
    return reply.status(200).send({
      openapi: '3.1.0',
      info: {
        title: 'Kardeşler Cihangir Ordering API',
        version: '1.0.0',
        description: 'Single-branch security-first ordering API (Integer Kuruş, PostGIS, RLS)',
      },
      paths: {
        '/healthz': { get: { summary: 'Liveness probe' } },
        '/readyz': { get: { summary: 'Readiness probe (verifies app_api & app_readonly)' } },
        '/api/v1/auth/customer/otp/request': { post: { summary: 'Request customer SMS OTP' } },
        '/api/v1/auth/customer/otp/verify': { post: { summary: 'Verify OTP & issue tokens' } },
        '/api/v1/auth/customer/refresh': { post: { summary: 'Rotate refresh token' } },
        '/api/v1/auth/staff/login': { post: { summary: 'Staff Argon2id + mandatory TOTP login' } },
        '/api/v1/menu': { get: { summary: 'Localized public menu (tr/en/ar)' } },
        '/api/v1/delivery/check': { post: { summary: 'Check PostGIS delivery zone & min order' } },
        '/api/v1/orders/quote': { post: { summary: 'Authoritative server-side price quote' } },
        '/api/v1/orders': { post: { summary: 'Create order via create_order() stored function' } },
        '/api/v1/payments/webhook': { post: { summary: 'Signed payment provider webhook' } },
        '/api/v1/print-agent/jobs/poll': { get: { summary: 'Poll ESC/POS CP857 print jobs' } },
      },
    });
  });

  // ==========================================================================
  // PHASE 2: CUSTOMER & STAFF AUTHENTICATION + ACCOUNT ERASURE
  // ==========================================================================
  app.post('/api/v1/auth/customer/otp/request', async (request, reply) => {
    const body = OtpRequestSchema.parse(request.body);
    const ip = request.ip;

    rateLimiter.checkSmsCircuitBreaker(50);
    rateLimiter.check(`otp:ip:${ip}`, 10, 15 * 60 * 1000, 'IP başına OTP sınırı aşıldı');
    rateLimiter.check(
      `otp:phone:${body.phone}`,
      5,
      24 * 60 * 60 * 1000,
      'Bu telefon numarası için günlük OTP sınırı aşıldı',
    );

    const res = await AuthService.requestCustomerOtp(body.phone, ip, smsProvider);
    return reply.status(200).send({
      message: 'Doğrulama kodu gönderildi',
      expiresInSeconds: res.expiresInSeconds,
    });
  });

  app.post('/api/v1/auth/customer/otp/verify', async (request, reply) => {
    const body = OtpVerifySchema.parse(request.body);
    rateLimiter.check(`otp_verify:ip:${request.ip}`, 15, 15 * 60 * 1000);

    const result = await AuthService.verifyCustomerOtp(
      body.phone,
      body.code,
      request.headers['user-agent'],
    );
    return reply.status(200).send(result);
  });

  app.post('/api/v1/auth/customer/refresh', async (request, reply) => {
    const schemaRefresh = z.object({ refreshToken: z.string().min(32) });
    const { refreshToken } = schemaRefresh.parse(request.body);
    rateLimiter.check(`refresh:ip:${request.ip}`, 30, 15 * 60 * 1000);

    const tokens = await AuthService.rotateRefreshToken(
      refreshToken,
      request.headers['user-agent'],
    );
    return reply.status(200).send(tokens);
  });

  app.post('/api/v1/auth/customer/logout', async (request, reply) => {
    const customer = requireCustomer(request);
    const body = z
      .object({ refreshToken: z.string().optional() })
      .optional()
      .parse(request.body);
    await AuthService.logoutCustomer(customer.sub, body?.refreshToken);
    return reply.status(200).send({ success: true });
  });

  app.delete('/api/v1/users/me', async (request, reply) => {
    const customer = requireCustomer(request);
    await withRlsTx({ role: 'customer', userId: customer.sub }, async (tx) => {
      await tx.execute(sql`SELECT public.anonymize_user(${customer.sub}::uuid)`);
    });
    return reply.status(200).send({
      anonymized: true,
      message: 'Hesabınız ve kişisel verileriniz KVKK kapsamında anonimleştirildi',
    });
  });

  app.post('/api/v1/auth/staff/login', async (request, reply) => {
    const loginSchema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      totpCode: z.string().length(6).optional(),
    });
    const body = loginSchema.parse(request.body);

    rateLimiter.check(
      `staff_login:${body.email.toLowerCase()}`,
      5,
      15 * 60 * 1000,
      'Çok fazla başarısız personel giriş denemesi, hesap geçici olarak kilitlendi',
    );

    const result = await AuthService.loginStaff(body.email, body.password, body.totpCode);
    return reply.status(200).send(result);
  });

  app.post('/api/v1/auth/staff/totp/setup', async (request, reply) => {
    const body = z.object({ setupToken: z.string().min(10) }).parse(request.body);
    const { sub: staffId } = AuthService.verifyStaffTotpSetupToken(body.setupToken);
    const secret = AuthService.generateTotpSecret();
    return reply.status(200).send({
      staffId,
      secret,
      otpauthUrl: `otpauth://totp/KardeslerCihangir:${staffId}?secret=${secret}&issuer=KardeslerCihangir`,
    });
  });

  app.post('/api/v1/auth/staff/totp/verify-setup', async (request, reply) => {
    const body = z
      .object({
        setupToken: z.string().min(10),
        secret: z.string().min(16),
        totpCode: z.string().length(6),
      })
      .parse(request.body);

    const result = await AuthService.setupAndVerifyStaffTotp(
      body.setupToken,
      body.secret,
      body.totpCode,
    );
    return reply.status(200).send(result);
  });

  // ==========================================================================
  // PHASE 3: MENU, DELIVERY ZONES, ADDRESSES & PUBLIC SETTINGS
  // ==========================================================================
  app.get('/api/v1/menu', async (request, reply) => {
    const lang = resolveLanguage(request);
    const cached = menuCache.get(lang);
    if (cached && cached.expiresAt > Date.now()) {
      return reply.status(200).send(cached.data);
    }

    const categoriesRows = await readonlyClient`
      SELECT
        c.id,
        c.sort_order AS "sortOrder",
        COALESCE(ct_req.name, ct_tr.name) AS name,
        COALESCE(ct_req.description, ct_tr.description) AS description
      FROM public.categories c
      LEFT JOIN public.category_translations ct_req
        ON ct_req.category_id = c.id AND ct_req.language = ${lang}
      LEFT JOIN public.category_translations ct_tr
        ON ct_tr.category_id = c.id AND ct_tr.language = 'tr'
      WHERE c.is_active = true
      ORDER BY c.sort_order ASC
    `;

    const itemsRows = await readonlyClient`
      SELECT
        mi.id,
        mi.category_id AS "categoryId",
        mi.price_kurus::int AS "priceKurus",
        mi.vat_rate_percent AS "vatRatePercent",
        mi.image_url AS "imageUrl",
        mi.is_available AS "isAvailable",
        mi.sort_order AS "sortOrder",
        mi.allergens,
        COALESCE(mit_req.name, mit_tr.name) AS name,
        COALESCE(mit_req.description, mit_tr.description) AS description
      FROM public.menu_items mi
      JOIN public.categories c ON c.id = mi.category_id
      LEFT JOIN public.menu_item_translations mit_req
        ON mit_req.menu_item_id = mi.id AND mit_req.language = ${lang}
      LEFT JOIN public.menu_item_translations mit_tr
        ON mit_tr.menu_item_id = mi.id AND mit_tr.language = 'tr'
      WHERE mi.deleted_at IS NULL AND c.is_active = true
      ORDER BY mi.sort_order ASC
    `;

    const optionsRows = await readonlyClient`
      SELECT
        o.id,
        og.id AS "groupId",
        og.menu_item_id AS "menuItemId",
        og.min_select AS "minSelect",
        og.max_select AS "maxSelect",
        og.is_required AS "isRequired",
        COALESCE(ogt_req.name, ogt_tr.name) AS "groupName",
        o.price_delta_kurus::int AS "priceDeltaKurus",
        o.is_available AS "isAvailable",
        COALESCE(ot_req.name, ot_tr.name) AS name
      FROM public.options o
      JOIN public.option_groups og ON og.id = o.option_group_id
      LEFT JOIN public.option_group_translations ogt_req
        ON ogt_req.option_group_id = og.id AND ogt_req.language = ${lang}
      LEFT JOIN public.option_group_translations ogt_tr
        ON ogt_tr.option_group_id = og.id AND ogt_tr.language = 'tr'
      LEFT JOIN public.option_translations ot_req
        ON ot_req.option_id = o.id AND ot_req.language = ${lang}
      LEFT JOIN public.option_translations ot_tr
        ON ot_tr.option_id = o.id AND ot_tr.language = 'tr'
      WHERE og.is_active = true
      ORDER BY og.sort_order ASC, o.sort_order ASC
    `;

    const items = itemsRows.map((item) => ({
      ...item,
      options: optionsRows.filter((o) => o.menuItemId === item.id),
    }));

    const payload = { language: lang, categories: categoriesRows, items };
    menuCache.set(lang, { expiresAt: Date.now() + 60_000, data: payload });
    return reply.status(200).send(payload);
  });

  app.patch('/api/v1/admin/menu/items/:id', async (request, reply) => {
    const owner = requireStaff(request, ['owner']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        priceKurus: z.number().int().nonnegative().optional(),
        isAvailable: z.boolean().optional(),
        allergens: z.array(z.enum(VALID_ALLERGENS)).optional(),
      })
      .parse(request.body);

    const updated = await withRlsTx({ role: 'owner', staffId: owner.sub }, async (tx) => {
      const [row] = await tx
        .update(schema.menuItems)
        .set({
          ...(body.priceKurus !== undefined ? { priceKurus: body.priceKurus } : {}),
          ...(body.isAvailable !== undefined ? { isAvailable: body.isAvailable } : {}),
          ...(body.allergens !== undefined ? { allergens: body.allergens } : {}),
        })
        .where(eq(schema.menuItems.id, id))
        .returning();

      if (!row) {
        throw new AppError('NOT_FOUND', 404, 'Menü ürünü bulunamadı');
      }
      return row;
    });

    invalidateMenuCache();
    return reply.status(200).send(updated);
  });

  app.post('/api/v1/delivery/check', async (request, reply) => {
    const { lat, lng } = z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .parse(request.body);

    const rows = await readonlyClient`
      SELECT
        id,
        name,
        min_order_kurus::int AS "minOrderKurus",
        delivery_fee_kurus::int AS "deliveryFeeKurus",
        estimated_minutes AS "estimatedMinutes"
      FROM public.find_delivery_zone(${lat}, ${lng})
    `;

    if (rows.length === 0) {
      return reply.status(200).send({
        covered: false,
        zone: null,
      });
    }

    return reply.status(200).send({
      covered: true,
      zone: rows[0],
    });
  });

  app.get('/api/v1/addresses', async (request, reply) => {
    const customer = requireCustomer(request);
    const rows = await withRlsTx({ role: 'customer', userId: customer.sub }, async (tx) => {
      return tx.execute(sql`
        SELECT
          id, label, full_address AS "fullAddress", building, floor, apartment, notes,
          ST_Y(location::geometry) AS lat,
          ST_X(location::geometry) AS lng
        FROM public.addresses
        WHERE user_id = ${customer.sub}::uuid AND deleted_at IS NULL
        ORDER BY created_at DESC
      `);
    });
    return reply.status(200).send({ addresses: rows });
  });

  app.post('/api/v1/addresses', async (request, reply) => {
    const customer = requireCustomer(request);
    const body = z
      .object({
        label: z.string().trim().min(1).max(50),
        fullAddress: z.string().trim().min(5).max(500),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        building: z.string().max(50).optional(),
        floor: z.string().max(20).optional(),
        apartment: z.string().max(20).optional(),
        notes: z.string().max(250).optional(),
      })
      .parse(request.body);

    const created = await withRlsTx({ role: 'customer', userId: customer.sub }, async (tx) => {
      const res = await tx.execute(sql`
        INSERT INTO public.addresses (
          user_id, label, full_address, location, building, floor, apartment, notes
        ) VALUES (
          ${customer.sub}::uuid,
          ${body.label},
          ${body.fullAddress},
          ST_SetSRID(ST_MakePoint(${body.lng}, ${body.lat}), 4326)::geography,
          ${body.building ?? null},
          ${body.floor ?? null},
          ${body.apartment ?? null},
          ${body.notes ?? null}
        )
        RETURNING
          id, label, full_address AS "fullAddress", building, floor, apartment, notes,
          ST_Y(location::geometry) AS lat,
          ST_X(location::geometry) AS lng
      `);
      return res[0];
    });

    return reply.status(201).send(created);
  });

  app.get('/api/v1/settings/public', async (_request, reply) => {
    const rows = await apiClient`
      SELECT
        s.name,
        s.phone,
        s.address,
        s.is_accepting_orders AS "isAcceptingOrders",
        s.opening_hours AS "openingHours",
        s.min_app_version AS "minAppVersion",
        s.currency,
        s.cod_max_amount_kurus::int AS "codMaxAmountKurus",
        s.heartbeat_grace_seconds AS "heartbeatGraceSeconds",
        (
          SELECT count(*)::int FROM public.heartbeats
        ) AS "totalHeartbeatsRegistered",
        (
          SELECT count(*)::int
          FROM public.heartbeats h
          WHERE h.last_seen_at >= clock_timestamp() - (s.heartbeat_grace_seconds || ' seconds')::interval
        ) AS "freshHeartbeats"
      FROM public.restaurant_settings s
      WHERE s.id = 1
    `;

    const s = rows[0];
    // If heartbeats have been registered by the restaurant tablet/print-agent,
    // require at least one fresh heartbeat within heartbeat_grace_seconds (Kill-Switch!).
    const heartbeatAlive = s.totalHeartbeatsRegistered === 0 || s.freshHeartbeats > 0;
    const orderingAvailable = Boolean(s.isAcceptingOrders && heartbeatAlive);

    return reply.status(200).send({
      name: s.name,
      phone: s.phone,
      address: s.address,
      currency: s.currency,
      minAppVersion: s.minAppVersion,
      openingHours: s.openingHours,
      codMaxAmountKurus: s.codMaxAmountKurus,
      isAcceptingOrders: s.isAcceptingOrders,
      heartbeatAlive,
      orderingAvailable,
    });
  });

  // ==========================================================================
  // PHASE 4: PRICING QUOTE & SERVER-AUTHORITATIVE ORDERS
  // ==========================================================================
  const quoteHandler = async (request: any, reply: any) => {
    const body = z
      .object({
        items: z.array(CartItemSchema).min(1),
        order_type: z.enum(['delivery', 'pickup']).default('delivery'),
        coupon_code: z.string().trim().optional(),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
      })
      .parse(request.body);

    let subtotalKurus = 0;

    for (const cartItem of body.items) {
      const itemRows = await readonlyClient`
        SELECT id, price_kurus::int AS "priceKurus", is_available AS "isAvailable"
        FROM public.menu_items
        WHERE id = ${cartItem.menu_item_id}::uuid AND deleted_at IS NULL
      `;
      if (itemRows.length === 0 || !itemRows[0].isAvailable) {
        throw new AppError('ITEM_UNAVAILABLE', 422, 'Ürün mevcut değil veya tükenmiş');
      }

      let optDelta = 0;
      if (cartItem.option_ids.length > 0) {
        const optRows = await readonlyClient`
          SELECT o.id, o.price_delta_kurus::int AS "priceDeltaKurus", o.is_available AS "isAvailable"
          FROM public.options o
          JOIN public.option_groups og ON og.id = o.option_group_id
          WHERE o.id = ANY(${cartItem.option_ids}::uuid[])
            AND og.menu_item_id = ${cartItem.menu_item_id}::uuid
        `;
        if (optRows.length !== cartItem.option_ids.length) {
          throw new AppError('VALIDATION_ERROR', 400, 'Geçersiz ürün seçeneği');
        }
        for (const o of optRows) {
          if (!o.isAvailable) {
            throw new AppError('ITEM_UNAVAILABLE', 422, 'Seçenek şu anda tükenmiş');
          }
          optDelta += o.priceDeltaKurus;
        }
      }

      subtotalKurus += (itemRows[0].priceKurus + optDelta) * cartItem.quantity;
    }

    let discountKurus = 0;
    let couponApplied: { code: string; discount_kurus: number } | null = null;

    if (body.coupon_code) {
      const couponRows = await apiClient`
        SELECT code, type, value::int AS value, max_discount_kurus::int AS "maxDiscountKurus",
               min_order_kurus::int AS "minOrderKurus", is_active AS "isActive",
               starts_at AS "startsAt", ends_at AS "endsAt"
        FROM public.coupons
        WHERE code = ${body.coupon_code}::citext
      `;
      if (couponRows.length > 0) {
        const c = couponRows[0];
        const now = Date.now();
        if (
          c.isActive &&
          now >= new Date(c.startsAt).getTime() &&
          now <= new Date(c.endsAt).getTime() &&
          subtotalKurus >= c.minOrderKurus
        ) {
          if (c.type === 'percent') {
            const raw = Math.round((subtotalKurus * c.value) / 100);
            discountKurus = c.maxDiscountKurus ? Math.min(raw, c.maxDiscountKurus) : raw;
          } else if (c.type === 'fixed_amount') {
            discountKurus = Math.min(c.value, subtotalKurus);
          }
          couponApplied = { code: c.code, discount_kurus: discountKurus };
        }
      }
    }

    let minOrderKurusApplied = 0;
    if (body.order_type === 'delivery' && body.lat !== undefined && body.lng !== undefined) {
      const zRows = await readonlyClient`
        SELECT min_order_kurus::int AS "minOrderKurus"
        FROM public.find_delivery_zone(${body.lat}, ${body.lng})
      `;
      if (zRows.length === 0) {
        throw new AppError('OUTSIDE_DELIVERY_ZONE', 422, 'Adres teslimat bölgesi dışında');
      }
      minOrderKurusApplied = zRows[0].minOrderKurus;
    }

    const totalKurus = subtotalKurus - discountKurus;
    const isMinOrderMet = totalKurus >= minOrderKurusApplied;
    const shortfall = isMinOrderMet ? 0 : minOrderKurusApplied - totalKurus;

    return reply.status(200).send({
      subtotal_kurus: subtotalKurus,
      discount_kurus: discountKurus,
      delivery_fee_kurus: 0,
      total_kurus: totalKurus,
      min_order_kurus_applied: minOrderKurusApplied,
      is_min_order_met: isMinOrderMet,
      min_order_shortfall_kurus: shortfall,
      coupon_applied: couponApplied,
    });
  };

  app.post('/api/v1/orders/quote', quoteHandler);
  app.post('/api/v1/cart/price', quoteHandler);

  app.post('/api/v1/orders', async (request, reply) => {
    const customer = requireCustomer(request);
    rateLimiter.check(`orders:create:${customer.sub}`, 20, 5 * 60 * 1000);

    const headerIdemKey = request.headers['idempotency-key'];
    const rawBody = (request.body ?? {}) as Record<string, unknown>;
    const bodyWithKey = {
      ...rawBody,
      idempotency_key:
        typeof headerIdemKey === 'string' && headerIdemKey.length >= 8
          ? headerIdemKey
          : rawBody.idempotency_key,
    };

    const OrderCreateInputSchema = CreateOrderSchema.extend({
      address_snapshot: z
        .object({
          full_address: z.string().optional(),
          street: z.string().optional(),
          building: z.string().optional(),
          lat: z.number(),
          lng: z.number(),
        })
        .optional(),
    });

    const parsed = OrderCreateInputSchema.parse(bodyWithKey);

    const createdOrder = await withRlsTx({ role: 'customer', userId: customer.sub }, async (tx) => {
      const itemsJson = JSON.stringify(parsed.items);
      const addrSnapshotJson = parsed.address_snapshot
        ? JSON.stringify(parsed.address_snapshot)
        : null;

      const res = await tx.execute<{ order_id: string }>(sql`
        SELECT public.create_order(
          ${parsed.order_type}::text,
          ${parsed.payment_method}::text,
          ${parsed.idempotency_key}::text,
          ${itemsJson}::jsonb,
          ${parsed.address_id ?? null}::uuid,
          ${addrSnapshotJson}::jsonb,
          ${parsed.coupon_code ?? null}::text,
          ${parsed.customer_note ?? null}::text
        ) AS order_id
      `);

      const orderId = res[0].order_id;
      const [orderRow] = await tx
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, orderId))
        .limit(1);

      return orderRow;
    });

    let paymentCheckout = null;
    if (createdOrder.paymentMethod === 'card_online') {
      paymentCheckout = await PaymentService.provider.initializePayment({
        orderId: createdOrder.id,
        amountKurus: Number(createdOrder.totalKurus),
        customerName: createdOrder.customerNameSnapshot,
        customerPhone: createdOrder.customerPhoneSnapshot,
        callbackUrl: 'https://api.kardeslercihangir.com/api/v1/payments/webhook',
      });
    } else {
      // Cash on delivery starts in 'new' and immediately notifies kitchen staff via SSE
      realtimeBroker.publish('order.created', {
        orderId: createdOrder.id,
        orderNumber: createdOrder.orderNumber,
        businessDate: createdOrder.businessDate,
        status: createdOrder.status,
        totalKurus: Number(createdOrder.totalKurus),
      });
    }

    return reply.status(201).send({
      id: createdOrder.id,
      orderNumber: createdOrder.orderNumber,
      businessDate: createdOrder.businessDate,
      status: createdOrder.status,
      subtotalKurus: Number(createdOrder.subtotalKurus),
      discountKurus: Number(createdOrder.discountKurus),
      deliveryFeeKurus: Number(createdOrder.deliveryFeeKurus),
      totalKurus: Number(createdOrder.totalKurus),
      paymentMethod: createdOrder.paymentMethod,
      paymentCheckout,
    });
  });

  app.get('/api/v1/orders', async (request, reply) => {
    const customer = requireCustomer(request);
    const rows = await withRlsTx({ role: 'customer', userId: customer.sub }, async (tx) => {
      return tx
        .select()
        .from(schema.orders)
        .orderBy(desc(schema.orders.createdAt));
    });
    return reply.status(200).send({ orders: rows });
  });

  app.get('/api/v1/orders/:id', async (request, reply) => {
    const customer = requireCustomer(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const detail = await withRlsTx({ role: 'customer', userId: customer.sub }, async (tx) => {
      const [order] = await tx
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, id))
        .limit(1);

      if (!order) {
        throw new AppError('NOT_FOUND', 404, 'Sipariş bulunamadı');
      }

      const items = await tx
        .select()
        .from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, id));

      const events = await tx
        .select()
        .from(schema.orderEvents)
        .where(eq(schema.orderEvents.orderId, id));

      return { order, items, events };
    });

    return reply.status(200).send(detail);
  });

  app.post('/api/v1/orders/:id/cancel', async (request, reply) => {
    const customer = requireCustomer(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({ reason: z.string().max(200).optional() })
      .optional()
      .parse(request.body);

    const result = await withRlsTx(
      { role: 'customer', userId: customer.sub, actorType: 'customer', actorId: customer.sub },
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(schema.orders)
          .where(eq(schema.orders.id, id))
          .limit(1);

        if (!existing) {
          throw new AppError('NOT_FOUND', 404, 'Sipariş bulunamadı');
        }

        if (existing.status !== 'awaiting_payment' && existing.status !== 'new') {
          throw new AppError(
            'INVALID_STATE_TRANSITION',
            409,
            'Hazırlanmaya başlanmış siparişler müşteri tarafından iptal edilemez',
          );
        }

        const [updated] = await tx
          .update(schema.orders)
          .set({
            status: 'cancelled',
            cancelReason: body?.reason ?? 'Müşteri tarafından iptal edildi',
          })
          .where(eq(schema.orders.id, id))
          .returning();

        return updated;
      },
    );

    // If order was paid online, process refund under system context
    const refunded = await withRlsTx({ role: 'system' }, async (tx) => {
      return PaymentService.refundOrderIfPaidInTx(
        tx,
        id,
        body?.reason ?? 'Customer cancelled order',
        customer.sub,
      );
    });

    return reply.status(200).send({ order: result, refunded });
  });

  app.post('/api/v1/orders/:id/reorder', async (request, reply) => {
    const customer = requireCustomer(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const report = await withRlsTx({ role: 'customer', userId: customer.sub }, async (tx) => {
      const [order] = await tx
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, id))
        .limit(1);

      if (!order) {
        throw new AppError('NOT_FOUND', 404, 'Sipariş bulunamadı');
      }

      const prevItems = await tx
        .select()
        .from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, id));

      const availableItems: unknown[] = [];
      const unavailableItems: unknown[] = [];
      const priceChanges: unknown[] = [];
      let newSubtotalKurus = 0;

      for (const pItem of prevItems) {
        const [currentItem] = await tx
          .select()
          .from(schema.menuItems)
          .where(eq(schema.menuItems.id, pItem.menuItemId))
          .limit(1);

        if (!currentItem || currentItem.deletedAt || !currentItem.isAvailable) {
          unavailableItems.push({
            menuItemId: pItem.menuItemId,
            name: pItem.nameSnapshot,
          });
          continue;
        }

        const oldUnitPrice = Number(pItem.unitPriceSnapshotKurus);
        const newUnitPrice = Number(currentItem.priceKurus);
        if (oldUnitPrice !== newUnitPrice) {
          priceChanges.push({
            menuItemId: pItem.menuItemId,
            name: pItem.nameSnapshot,
            oldPriceKurus: oldUnitPrice,
            newPriceKurus: newUnitPrice,
          });
        }

        const lineTotal = newUnitPrice * pItem.quantity;
        newSubtotalKurus += lineTotal;
        availableItems.push({
          menuItemId: pItem.menuItemId,
          name: pItem.nameSnapshot,
          quantity: pItem.quantity,
          unitPriceKurus: newUnitPrice,
          lineTotalKurus: lineTotal,
        });
      }

      return {
        sourceOrderId: order.id,
        availableItems,
        unavailableItems,
        priceChanges,
        newSubtotalKurus,
      };
    });

    return reply.status(200).send(report);
  });

  // ==========================================================================
  // PHASE 5: STAFF OPERATIONS, SSE REALTIME, PRINT AGENT & HEARTBEATS
  // ==========================================================================
  app.get('/api/v1/staff/orders', async (request, reply) => {
    const staff = requireStaff(request, ['staff', 'owner']);
    const rows = await withRlsTx({ role: staff.role, staffId: staff.sub }, async (tx) => {
      return tx
        .select()
        .from(schema.orders)
        .orderBy(desc(schema.orders.createdAt));
    });
    return reply.status(200).send({ orders: rows });
  });

  const handleStaffStatusTransition = async (request: any, reply: any) => {
    const staff = requireStaff(request, ['staff', 'owner']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        status: z.enum(ORDER_STATUSES),
        cancel_reason: z.string().max(200).optional(),
      })
      .parse(request.body);

    const updated = await withRlsTx(
      { role: staff.role, staffId: staff.sub, actorType: 'staff', actorId: staff.sub },
      async (tx) => {
        const [order] = await tx
          .update(schema.orders)
          .set({
            status: body.status,
            ...(body.cancel_reason ? { cancelReason: body.cancel_reason } : {}),
          })
          .where(eq(schema.orders.id, id))
          .returning();

        if (!order) {
          throw new AppError('NOT_FOUND', 404, 'Sipariş bulunamadı');
        }

        // If cancelled or rejected, automatically refund if paid online card order
        if (body.status === 'cancelled' || body.status === 'rejected') {
          await PaymentService.refundOrderIfPaidInTx(
            tx,
            order.id,
            body.cancel_reason ?? `Order ${body.status} by staff`,
            staff.sub,
          );
        }

        // If delivered, award loyalty points (5% in points = 1 point per 20 kuruş)
        // and settle any pending referral reward on the user's first delivered order!
        if (body.status === 'delivered' && order.userId) {
          const earnedPoints = Math.max(1, Math.floor(Number(order.totalKurus) / 100));
          await tx.insert(schema.loyaltyLedger).values({
            userId: order.userId,
            points: earnedPoints,
            reason: `Sipariş #${order.orderNumber} teslimat puanı`,
            orderId: order.id,
          });

          const pendingRefs = await tx
            .select()
            .from(schema.referrals)
            .where(
              and(
                eq(schema.referrals.referredUserId, order.userId),
                eq(schema.referrals.status, 'pending'),
              ),
            )
            .limit(1);

          if (pendingRefs.length > 0) {
            const ref = pendingRefs[0];
            await tx
              .update(schema.referrals)
              .set({
                status: 'rewarded',
                orderId: order.id,
                rewardedAt: new Date(),
              })
              .where(eq(schema.referrals.id, ref.id));

            await tx.insert(schema.loyaltyLedger).values([
              {
                userId: ref.referrerUserId,
                points: 100,
                reason: 'Arkadaş davet ödülü (Referrer bonus)',
                orderId: order.id,
              },
              {
                userId: ref.referredUserId,
                points: 50,
                reason: 'Hoş geldin davet ödülü (Referred bonus)',
                orderId: order.id,
              },
            ]);
          }
        }

        return order;
      },
    );

    realtimeBroker.publish('order.status_changed', {
      orderId: updated.id,
      orderNumber: updated.orderNumber,
      toStatus: updated.status,
    });

    return reply.status(200).send({ order: updated });
  };

  app.post('/api/v1/staff/orders/:id/status', handleStaffStatusTransition);
  app.patch('/api/v1/orders/:id/status', handleStaffStatusTransition);

  app.post('/api/v1/staff/orders/:id/driver', async (request, reply) => {
    const staff = requireStaff(request, ['staff', 'owner']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { driverId } = z.object({ driverId: z.string().uuid() }).parse(request.body);

    const updated = await withRlsTx({ role: staff.role, staffId: staff.sub }, async (tx) => {
      const [order] = await tx
        .update(schema.orders)
        .set({ driverId })
        .where(eq(schema.orders.id, id))
        .returning();

      if (!order) {
        throw new AppError('NOT_FOUND', 404, 'Sipariş bulunamadı');
      }
      return order;
    });

    return reply.status(200).send({ order: updated });
  });

  app.post('/api/v1/staff/orders/:id/reprint', async (request, reply) => {
    const staff = requireStaff(request, ['staff', 'owner']);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const job = await withRlsTx({ role: staff.role, staffId: staff.sub }, async (tx) => {
      const [created] = await tx
        .insert(schema.printJobs)
        .values({
          orderId: id,
          kind: 'reprint',
          status: 'pending',
        })
        .returning();
      return created;
    });

    return reply.status(201).send({ printJob: job });
  });

  app.post('/api/v1/staff/settings/pause', async (request, reply) => {
    const staff = requireStaff(request, ['staff', 'owner']);
    const { isAcceptingOrders } = z
      .object({ isAcceptingOrders: z.boolean() })
      .parse(request.body);

    const updated = await withRlsTx({ role: staff.role, staffId: staff.sub }, async (tx) => {
      const [row] = await tx
        .update(schema.restaurantSettings)
        .set({ isAcceptingOrders })
        .where(eq(schema.restaurantSettings.id, 1))
        .returning();
      return row;
    });

    return reply.status(200).send({ isAcceptingOrders: updated.isAcceptingOrders });
  });

  app.get('/api/v1/realtime/staff', async (request, reply) => {
    requireStaff(request, ['staff', 'owner']);
    const lastIdHeader = request.headers['last-event-id'];
    const lastEventId = typeof lastIdHeader === 'string' ? parseInt(lastIdHeader, 10) : undefined;

    // For testability and instant replay inspection when `x-sse-mode: snapshot` is sent
    if (request.headers['x-sse-mode'] === 'snapshot') {
      const events =
        lastEventId !== undefined && !Number.isNaN(lastEventId)
          ? realtimeBroker.getEventsSince(lastEventId)
          : realtimeBroker.getEventsSince(0);
      return reply.status(200).send({ events });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const unsubscribe = realtimeBroker.subscribe(reply.raw, lastEventId);
    request.raw.on('close', () => {
      unsubscribe();
    });
  });

  app.post('/api/v1/print-agent/token', async (request, reply) => {
    requireStaff(request, ['owner']);
    const { deviceId } = z.object({ deviceId: z.string().min(2).max(100) }).parse(request.body);
    const { token, jti } = AuthService.generatePrintAgentToken(deviceId);
    return reply.status(201).send({ deviceId, token, jti });
  });

  app.post('/api/v1/print-agent/token/revoke', async (request, reply) => {
    requireStaff(request, ['owner']);
    const { jti } = z.object({ jti: z.string().uuid() }).parse(request.body);
    AuthService.revokePrintAgentToken(jti);
    return reply.status(200).send({ revoked: true, jti });
  });

  app.get('/api/v1/print-agent/jobs/poll', async (request, reply) => {
    const agent = requirePrintAgent(request);

    const jobsWithTickets = await withRlsTx({ role: 'print_agent' }, async (tx) => {
      // Record print_agent heartbeat automatically on poll
      await tx
        .insert(schema.heartbeats)
        .values({
          deviceId: agent.sub,
          kind: 'print_agent',
          lastSeenAt: new Date(),
          meta: { polledAt: new Date().toISOString() },
        })
        .onConflictDoUpdate({
          target: schema.heartbeats.deviceId,
          set: { lastSeenAt: new Date() },
        });

      const pendingJobs = await tx
        .select()
        .from(schema.printJobs)
        .where(eq(schema.printJobs.status, 'pending'))
        .orderBy(schema.printJobs.createdAt)
        .limit(10);

      const results = [];
      for (const job of pendingJobs) {
        const [order] = await tx
          .select()
          .from(schema.orders)
          .where(eq(schema.orders.id, job.orderId))
          .limit(1);

        if (!order) continue;

        const items = await tx
          .select()
          .from(schema.orderItems)
          .where(eq(schema.orderItems.orderId, order.id));

        const formattedItems = [];
        for (const item of items) {
          const opts = await tx
            .select()
            .from(schema.orderItemOptions)
            .where(eq(schema.orderItemOptions.orderItemId, item.id));

          formattedItems.push({
            quantity: item.quantity,
            nameTr: item.nameSnapshot,
            unitPriceKurus: Number(item.unitPriceSnapshotKurus),
            lineTotalKurus: Number(item.lineTotalKurus),
            options: opts.map((o) => ({
              nameTr: o.nameSnapshot,
              priceDeltaKurus: Number(o.priceDeltaSnapshotKurus),
            })),
          });
        }

        const addrObj = (order.addressSnapshot ?? {}) as Record<string, unknown>;
        const addressText =
          typeof addrObj.full_address === 'string'
            ? addrObj.full_address
            : typeof addrObj.street === 'string'
              ? `${addrObj.street} No:${addrObj.building ?? ''}`
              : null;

        const ticket = ThermalTicketService.formatKitchenTicket({
          orderNumber: order.orderNumber,
          businessDate: order.businessDate,
          orderType: order.orderType as 'delivery' | 'pickup',
          paymentMethod: order.paymentMethod as 'card_online' | 'cash_on_delivery',
          customerName: order.customerNameSnapshot,
          customerPhone: order.customerPhoneSnapshot,
          addressText,
          customerNote: order.customerNote,
          items: formattedItems,
          subtotalKurus: Number(order.subtotalKurus),
          discountKurus: Number(order.discountKurus),
          totalKurus: Number(order.totalKurus),
          createdAt: order.createdAt,
        });

        results.push({
          jobId: job.id,
          orderId: order.id,
          orderNumber: order.orderNumber,
          kind: job.kind,
          textTr: ticket.textTr,
          escPosBase64: ticket.escPosBase64,
        });
      }

      return results;
    });

    return reply.status(200).send({ jobs: jobsWithTickets });
  });

  app.post('/api/v1/print-agent/jobs/:id/ack', async (request, reply) => {
    requirePrintAgent(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        status: z.enum(['printed', 'failed']),
        error: z.string().max(500).optional(),
      })
      .parse(request.body);

    const updated = await withRlsTx({ role: 'print_agent' }, async (tx) => {
      const [row] = await tx
        .update(schema.printJobs)
        .set({
          status: body.status,
          printedAt: body.status === 'printed' ? new Date() : null,
          lastError: body.error ?? null,
          attempts: sql`${schema.printJobs.attempts} + 1`,
        })
        .where(eq(schema.printJobs.id, id))
        .returning();

      if (!row) {
        throw new AppError('NOT_FOUND', 404, 'Yazdırma görevi bulunamadı');
      }
      return row;
    });

    return reply.status(200).send({ printJob: updated });
  });

  app.post('/api/v1/heartbeats', async (request, reply) => {
    const staff = requireStaff(request, ['staff', 'owner']);
    const body = z
      .object({
        deviceId: z.string().min(1).max(120),
        kind: z.enum(['print_agent', 'staff_tablet']),
        meta: z.record(z.unknown()).optional(),
      })
      .parse(request.body);

    await withRlsTx({ role: staff.role, staffId: staff.sub }, async (tx) => {
      await tx
        .insert(schema.heartbeats)
        .values({
          deviceId: body.deviceId,
          kind: body.kind,
          lastSeenAt: new Date(),
          meta: body.meta ?? {},
        })
        .onConflictDoUpdate({
          target: schema.heartbeats.deviceId,
          set: { lastSeenAt: new Date(), meta: body.meta ?? {} },
        });
    });

    return reply.status(200).send({ recorded: true });
  });

  // ==========================================================================
  // PHASE 6: PAYMENTS WEBHOOK
  // ==========================================================================
  app.post('/api/v1/payments/webhook', async (request, reply) => {
    const payload = z
      .object({
        providerEventId: z.string().min(3),
        orderId: z.string().uuid(),
        amountKurus: z.number().int().nonnegative(),
        status: z.enum(['paid', 'failed']),
        providerRef: z.string().min(1),
        signature: z.string().min(16),
      })
      .parse(request.body);

    const result = await PaymentService.processWebhook(payload, (activatedOrderId) => {
      realtimeBroker.publish('order.created', {
        orderId: activatedOrderId,
        status: 'new',
        source: 'payment_webhook',
      });
    });

    return reply.status(200).send(result);
  });

  // ==========================================================================
  // PHASE 7: GROWTH, LOYALTY, REFERRALS, REVIEWS & CONSENTS
  // ==========================================================================
  app.get('/api/v1/loyalty/me', async (request, reply) => {
    const customer = requireCustomer(request);
    const data = await withRlsTx({ role: 'customer', userId: customer.sub }, async (tx) => {
      const balanceRows = await tx.execute<{
        current_balance: number;
        active_balance: number;
      }>(sql`
        SELECT
          current_balance::int AS current_balance,
          active_balance::int AS active_balance
        FROM public.loyalty_balances
        WHERE user_id = ${customer.sub}::uuid
      `);

      const ledger = await tx
        .select()
        .from(schema.loyaltyLedger)
        .where(eq(schema.loyaltyLedger.userId, customer.sub))
        .orderBy(desc(schema.loyaltyLedger.createdAt));

      return {
        currentBalance: balanceRows[0]?.current_balance ?? 0,
        activeBalance: balanceRows[0]?.active_balance ?? 0,
        ledger,
      };
    });

    return reply.status(200).send(data);
  });

  app.post('/api/v1/reviews', async (request, reply) => {
    const customer = requireCustomer(request);
    const body = z
      .object({
        orderId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(500).optional(),
      })
      .parse(request.body);

    const review = await withRlsTx({ role: 'customer', userId: customer.sub }, async (tx) => {
      const [order] = await tx
        .select()
        .from(schema.orders)
        .where(and(eq(schema.orders.id, body.orderId), eq(schema.orders.userId, customer.sub)))
        .limit(1);

      if (!order) {
        throw new AppError('NOT_FOUND', 404, 'Sipariş bulunamadı');
      }

      if (order.status !== 'delivered') {
        throw new AppError(
          'VALIDATION_ERROR',
          422,
          'Sadece teslim edilmiş (delivered) siparişler için değerlendirme yapılabilir',
        );
      }

      const [inserted] = await tx
        .insert(schema.reviews)
        .values({
          orderId: body.orderId,
          userId: customer.sub,
          rating: body.rating,
          comment: body.comment ?? null,
        })
        .returning();

      return inserted;
    });

    return reply.status(201).send({ review });
  });

  app.post('/api/v1/consents', async (request, reply) => {
    const customer = requireCustomer(request);
    const body = z
      .object({
        type: z.enum(['terms', 'privacy', 'marketing_sms', 'marketing_push', 'marketing_email']),
        granted: z.boolean(),
        source: z.string().min(1).max(50).default('mobile_app'),
        version: z.string().min(1).max(20).default('v1.0'),
      })
      .parse(request.body);

    const consent = await withRlsTx({ role: 'customer', userId: customer.sub }, async (tx) => {
      const [inserted] = await tx
        .insert(schema.consents)
        .values({
          userId: customer.sub,
          type: body.type,
          granted: body.granted,
          source: body.source,
          version: body.version,
        })
        .returning();
      return inserted;
    });

    return reply.status(201).send({ consent });
  });

  // ==========================================================================
  // PHASE 8: OWNER REPORTS & AUDIT LOGS
  // ==========================================================================
  app.get('/api/v1/admin/reports/daily-summary', async (request, reply) => {
    const owner = requireStaff(request, ['owner']);
    const query = z
      .object({ businessDate: z.string().optional() })
      .parse(request.query);

    const summary = await withRlsTx({ role: 'owner', staffId: owner.sub }, async (tx) => {
      const dateRows = await tx.execute<{ bdate: string }>(sql`
        SELECT COALESCE(${query.businessDate ?? null}::date, public.business_date_of(clock_timestamp()))::text AS bdate
      `);
      const targetDate = dateRows[0].bdate;

      const stats = await tx.execute<{
        total_orders: number;
        delivered_orders: number;
        cancelled_or_rejected: number;
        gross_revenue_kurus: number;
        total_discount_kurus: number;
      }>(sql`
        SELECT
          count(*)::int AS total_orders,
          count(*) FILTER (WHERE status = 'delivered')::int AS delivered_orders,
          count(*) FILTER (WHERE status IN ('cancelled', 'rejected'))::int AS cancelled_or_rejected,
          COALESCE(sum(total_kurus) FILTER (WHERE status = 'delivered'), 0)::bigint AS gross_revenue_kurus,
          COALESCE(sum(discount_kurus) FILTER (WHERE status = 'delivered'), 0)::bigint AS total_discount_kurus
        FROM public.orders
        WHERE business_date = ${targetDate}::date
      `);

      const driverCashSettlement = await tx.execute<{
        driver_id: string;
        driver_name: string;
        delivered_cod_orders: number;
        cash_collected_kurus: number;
      }>(sql`
        SELECT
          d.id AS driver_id,
          d.name AS driver_name,
          count(o.id)::int AS delivered_cod_orders,
          COALESCE(sum(o.total_kurus), 0)::bigint AS cash_collected_kurus
        FROM public.drivers d
        LEFT JOIN public.orders o
          ON o.driver_id = d.id
          AND o.business_date = ${targetDate}::date
          AND o.payment_method = 'cash_on_delivery'
          AND o.status = 'delivered'
        GROUP BY d.id, d.name
        ORDER BY d.name ASC
      `);

      return {
        businessDate: targetDate,
        metrics: stats[0],
        driverCashSettlement,
      };
    });

    return reply.status(200).send(summary);
  });

  app.get('/api/v1/admin/audit-logs', async (request, reply) => {
    const owner = requireStaff(request, ['owner']);
    const logs = await withRlsTx({ role: 'owner', staffId: owner.sub }, async (tx) => {
      return tx
        .select()
        .from(schema.auditLogs)
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(50);
    });
    return reply.status(200).send({ auditLogs: logs });
  });

  return app;
}

if (process.argv[1]?.endsWith('main.ts') || process.argv[1]?.endsWith('main.js')) {
  const server = buildApp();
  verifyDbSecurityPosture()
    .then(() => server.listen({ port: env.PORT, host: env.HOST }))
    .then((address) => {
      console.log(`Kardeşler Cihangir Backend API running at ${address}`);
    })
    .catch(async (err) => {
      server.log.fatal({ err }, 'Startup failed security posture or listen check');
      await closeDbPools();
      process.exit(1);
    });

  const shutdown = async () => {
    await server.close();
    await closeDbPools();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
