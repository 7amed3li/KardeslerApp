import { desc, eq, sql } from 'drizzle-orm';
import { withTx, schema } from '../db/client.js';
import type { AdminRepository, BackgroundJobRepository } from '../../ports/repositories.js';

export class PostgresAdminRepository implements AdminRepository {
  async getDailySummary(staffId: string, businessDate?: string) {
    return withTx({ role: 'owner', staffId }, async (tx) => {
      const dateRows = await tx.execute<{ bdate: string }>(sql`
        SELECT COALESCE(${businessDate ?? null}::date, public.business_date_of(clock_timestamp()))::text AS bdate
      `);
      const targetDate = dateRows[0].bdate;
      const stats = await tx.execute(sql`
        SELECT
          count(*)::int AS total_orders,
          count(*) FILTER (WHERE status = 'delivered')::int AS delivered_orders,
          count(*) FILTER (WHERE status IN ('cancelled', 'rejected'))::int AS cancelled_or_rejected,
          COALESCE(sum(total_kurus) FILTER (WHERE status = 'delivered'), 0)::bigint AS gross_revenue_kurus,
          COALESCE(sum(discount_kurus) FILTER (WHERE status = 'delivered'), 0)::bigint AS total_discount_kurus
        FROM public.orders WHERE business_date = ${targetDate}::date
      `);
      const driverCashSettlement = await tx.execute(sql`
        SELECT d.id AS driver_id, d.name AS driver_name,
          count(o.id)::int AS delivered_cod_orders,
          COALESCE(sum(o.total_kurus), 0)::bigint AS cash_collected_kurus
        FROM public.drivers d
        LEFT JOIN public.orders o ON o.driver_id = d.id AND o.business_date = ${targetDate}::date
          AND o.payment_method = 'cash_on_delivery' AND o.status = 'delivered'
        GROUP BY d.id, d.name ORDER BY d.name ASC
      `);
      return { businessDate: targetDate, metrics: stats[0], driverCashSettlement };
    });
  }

  async getAuditLogs(staffId: string) {
    return withTx({ role: 'owner', staffId }, async (tx) =>
      tx.select().from(schema.auditLogs).orderBy(desc(schema.auditLogs.createdAt)).limit(50),
    );
  }

  async listDrivers(staffId: string) {
    return withTx({ role: 'owner', staffId }, async (tx) => tx.select().from(schema.drivers));
  }

  async createDriver(staffId: string, input: { name: string; phone: string }) {
    return withTx({ role: 'owner', staffId }, async (tx) => {
      const [row] = await tx.insert(schema.drivers).values({ name: input.name, phone: input.phone, isActive: true }).returning();
      return row;
    });
  }

  async listStaff(staffId: string) {
    return withTx({ role: 'owner', staffId }, async (tx) =>
      tx.select({
        id: schema.staffUsers.id, email: schema.staffUsers.email, role: schema.staffUsers.role,
        totpEnabled: schema.staffUsers.totpEnabled, isActive: schema.staffUsers.isActive, lastLoginAt: schema.staffUsers.lastLoginAt,
      }).from(schema.staffUsers),
    );
  }

  async listFraudFlags(staffId: string) {
    return withTx({ role: 'owner', staffId }, async (tx) =>
      tx.select().from(schema.fraudFlags).orderBy(desc(schema.fraudFlags.createdAt)).limit(50),
    );
  }

  async resolveFraudFlag(staffId: string, flagId: string, now: Date) {
    return withTx({ role: 'owner', staffId }, async (tx) => {
      const [row] = await tx
        .update(schema.fraudFlags)
        .set({ resolved: true, resolvedBy: staffId, resolvedAt: now })
        .where(eq(schema.fraudFlags.id, flagId))
        .returning();
      return row ?? null;
    });
  }

  async listBanners(staffId: string) {
    return withTx({ role: 'owner', staffId }, async (tx) => tx.select().from(schema.banners).orderBy(schema.banners.sortOrder));
  }

  async createBanner(staffId: string, input: Record<string, unknown>) {
    return withTx({ role: 'owner', staffId }, async (tx) => {
      const [row] = await tx
        .insert(schema.banners)
        .values({
          imageUrl: String(input.imageUrl),
          titleTranslations: input.titleTranslations,
          targetType: String(input.targetType),
          targetId: input.targetId ? String(input.targetId) : null,
          startsAt: new Date(String(input.startsAt)),
          endsAt: new Date(String(input.endsAt)),
          sortOrder: Number(input.sortOrder ?? 0),
          isActive: Boolean(input.isActive ?? true),
        })
        .returning();
      return row;
    });
  }

  async updateSettings(staffId: string, patch: Record<string, unknown>) {
    return withTx({ role: 'owner', staffId }, async (tx) => {
      const [row] = await tx
        .update(schema.restaurantSettings)
        .set({
          ...(patch.isAcceptingOrders !== undefined ? { isAcceptingOrders: Boolean(patch.isAcceptingOrders) } : {}),
          ...(patch.codMaxAmountKurus !== undefined ? { codMaxAmountKurus: Number(patch.codMaxAmountKurus) } : {}),
          ...(patch.codMaxOpenOrders !== undefined ? { codMaxOpenOrders: Number(patch.codMaxOpenOrders) } : {}),
          ...(patch.paymentTimeoutMinutes !== undefined ? { paymentTimeoutMinutes: Number(patch.paymentTimeoutMinutes) } : {}),
          ...(patch.heartbeatGraceSeconds !== undefined ? { heartbeatGraceSeconds: Number(patch.heartbeatGraceSeconds) } : {}),
        })
        .where(eq(schema.restaurantSettings.id, 1))
        .returning();
      return row;
    });
  }
}

export class PostgresBackgroundJobRepository implements BackgroundJobRepository {
  async expireUnpaidCardOrders() {
    return withTx({ role: 'system' }, async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`
        UPDATE public.orders o SET status = 'cancelled', cancel_reason = 'Ödeme süresi doldu (Unpaid card order timeout)'
        FROM public.restaurant_settings s
        WHERE s.id = 1 AND o.status = 'awaiting_payment'
          AND o.created_at < clock_timestamp() - (s.payment_timeout_minutes || ' minutes')::interval
        RETURNING o.id
      `);
      return { expiredCount: rows.length, orderIds: rows.map((r) => r.id) };
    });
  }

  async findUnacceptedOrdersPastThreshold() {
    return withTx({ role: 'system' }, async (tx) => {
      const rows = await tx.execute<{ id: string; order_number: number }>(sql`
        SELECT o.id, o.order_number FROM public.orders o CROSS JOIN public.restaurant_settings s
        WHERE s.id = 1 AND o.status = 'new'
          AND o.created_at < clock_timestamp() - (s.unaccepted_order_alert_minutes || ' minutes')::interval
      `);
      return rows.map((r) => ({ id: r.id, orderNumber: r.order_number }));
    });
  }

  async cleanupExpiredAuthRecords() {
    return withTx({ role: 'system' }, async (tx) => {
      const otp = await tx.execute<{ count: number }>(sql`
        WITH d AS (DELETE FROM public.otp_codes WHERE expires_at < clock_timestamp() - interval '1 day' RETURNING 1)
        SELECT count(*)::int AS count FROM d
      `);
      const rt = await tx.execute<{ count: number }>(sql`
        WITH d AS (DELETE FROM public.refresh_tokens WHERE expires_at < clock_timestamp() - interval '7 days' RETURNING 1)
        SELECT count(*)::int AS count FROM d
      `);
      return { deletedOtps: otp[0]?.count ?? 0, deletedRefreshTokens: rt[0]?.count ?? 0 };
    });
  }

  async reconcileStalePendingPayments() {
    return withTx({ role: 'system' }, async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`
        UPDATE public.payments p SET status = 'failed', failure_reason = 'Reconciled after order cancellation'
        FROM public.orders o
        WHERE p.order_id = o.id AND p.status = 'pending' AND o.status IN ('cancelled', 'rejected')
        RETURNING p.id
      `);
      return rows.length;
    });
  }

  async listFailedNotifications(limit = 20) {
    return withTx({ role: 'system' }, async (tx) => {
      const rows = await tx.execute<{ id: string; push_token: string; title: string; body: string; data: unknown }>(sql`
        SELECT n.id, d.push_token, n.title, n.body, n.data
        FROM public.notifications n
        JOIN public.devices d ON d.id = n.device_id
        WHERE n.status = 'failed' ORDER BY n.created_at ASC LIMIT ${limit}
      `);
      return rows.map((r) => ({ id: r.id, pushToken: r.push_token, title: r.title, body: r.body, data: r.data }));
    });
  }

  async markNotificationRetryResult(id: string, success: boolean, ticketIdOrReason: string, now: Date) {
    await withTx({ role: 'system' }, async (tx) => {
      await tx
        .update(schema.notifications)
        .set({
          status: success ? 'sent' : 'failed',
          ...(success ? { providerTicketId: ticketIdOrReason, sentAt: now } : { failureReason: ticketIdOrReason }),
        })
        .where(eq(schema.notifications.id, id));
    });
  }
}

