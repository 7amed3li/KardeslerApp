import { and, desc, eq, sql } from 'drizzle-orm';
import { withTx, schema } from '../db/client.js';
import type { CouponRepository, LoyaltyRepository } from '../../ports/repositories.js';
import type { CouponRule } from '../../domain/coupons/coupon.domain.js';

export class PostgresCouponRepository implements CouponRepository {
  async findByCode(code: string): Promise<CouponRule | null> {
    return withTx({ role: 'system' }, async (tx) => {
      const rows = await tx.execute<Record<string, any>>(sql`
        SELECT id, code::text AS code, type, value::int AS value,
          max_discount_kurus::int AS "maxDiscountKurus", min_order_kurus::int AS "minOrderKurus",
          starts_at AS "startsAt", ends_at AS "endsAt", is_active AS "isActive",
          max_total_uses AS "maxTotalUses", used_count AS "usedCount",
          max_uses_per_user AS "maxUsesPerUser", first_order_only AS "firstOrderOnly",
          applies_to AS "appliesTo", active_hours AS "activeHours"
        FROM public.coupons WHERE code = ${code}::citext LIMIT 1
      `);
      if (rows.length === 0) return null;
      const c = rows[0];
      const cats = await tx.execute<{ id: string }>(sql`SELECT category_id AS id FROM public.coupon_categories WHERE coupon_id = ${c.id}::uuid`);
      const items = await tx.execute<{ id: string }>(sql`SELECT menu_item_id AS id FROM public.coupon_menu_items WHERE coupon_id = ${c.id}::uuid`);
      return {
        id: c.id,
        code: c.code,
        type: c.type,
        value: Number(c.value),
        maxDiscountKurus: c.maxDiscountKurus != null ? Number(c.maxDiscountKurus) : null,
        minOrderKurus: Number(c.minOrderKurus),
        startsAt: new Date(c.startsAt),
        endsAt: new Date(c.endsAt),
        isActive: Boolean(c.isActive),
        maxTotalUses: c.maxTotalUses != null ? Number(c.maxTotalUses) : null,
        usedCount: Number(c.usedCount),
        maxUsesPerUser: Number(c.maxUsesPerUser),
        firstOrderOnly: Boolean(c.firstOrderOnly),
        appliesTo: c.appliesTo,
        activeHours: c.activeHours ?? null,
        targetCategoryIds: cats.map((x) => x.id),
        targetMenuItemIds: items.map((x) => x.id),
      };
    });
  }

  async getUserUsageStats(userId: string, couponId: string) {
    return withTx({ role: 'customer', userId }, async (tx) => {
      const redRows = await tx.execute<{ cnt: number }>(sql`
        SELECT count(*)::int AS cnt FROM public.coupon_redemptions cr
        JOIN public.orders o ON o.id = cr.order_id
        WHERE cr.coupon_id = ${couponId}::uuid AND cr.user_id = ${userId}::uuid
          AND o.status NOT IN ('cancelled', 'rejected')
      `);
      const ordRows = await tx.execute<{ cnt: number }>(sql`
        SELECT count(*)::int AS cnt FROM public.orders
        WHERE user_id = ${userId}::uuid AND status = 'delivered'
      `);
      return {
        redemptionsCount: redRows[0]?.cnt ?? 0,
        deliveredOrdersCount: ordRows[0]?.cnt ?? 0,
      };
    });
  }

  async listAdminCoupons(staffId: string): Promise<unknown[]> {
    return withTx({ role: 'owner', staffId }, async (tx) => {
      return tx.select().from(schema.coupons).orderBy(desc(schema.coupons.createdAt));
    });
  }

  async createAdminCoupon(staffId: string, input: Record<string, unknown>): Promise<unknown> {
    return withTx({ role: 'owner', staffId }, async (tx) => {
      const [created] = await tx
        .insert(schema.coupons)
        .values({
          code: String(input.code),
          type: String(input.type),
          value: Number(input.value),
          maxDiscountKurus: input.maxDiscountKurus != null ? Number(input.maxDiscountKurus) : null,
          minOrderKurus: Number(input.minOrderKurus ?? 0),
          startsAt: new Date(String(input.startsAt)),
          endsAt: new Date(String(input.endsAt)),
          maxTotalUses: input.maxTotalUses != null ? Number(input.maxTotalUses) : null,
          maxUsesPerUser: Number(input.maxUsesPerUser ?? 1),
          firstOrderOnly: Boolean(input.firstOrderOnly ?? false),
          appliesTo: String(input.appliesTo ?? 'all'),
          isActive: Boolean(input.isActive ?? true),
        })
        .returning();
      return created;
    });
  }

  async updateAdminCoupon(staffId: string, id: string, patch: Record<string, unknown>) {
    return withTx({ role: 'owner', staffId }, async (tx) => {
      const [updated] = await tx
        .update(schema.coupons)
        .set({
          ...(patch.isActive !== undefined ? { isActive: Boolean(patch.isActive) } : {}),
          ...(patch.minOrderKurus !== undefined ? { minOrderKurus: Number(patch.minOrderKurus) } : {}),
          ...(patch.maxTotalUses !== undefined ? { maxTotalUses: patch.maxTotalUses == null ? null : Number(patch.maxTotalUses) } : {}),
          ...(patch.endsAt !== undefined ? { endsAt: new Date(String(patch.endsAt)) } : {}),
        })
        .where(eq(schema.coupons.id, id))
        .returning();
      return updated ?? null;
    });
  }
}

export class PostgresLoyaltyRepository implements LoyaltyRepository {
  async getCustomerLoyalty(userId: string) {
    return withTx({ role: 'customer', userId }, async (tx) => {
      const bal = await tx.execute<{ current_balance: number; active_balance: number }>(sql`
        SELECT current_balance::int AS current_balance, active_balance::int AS active_balance
        FROM public.loyalty_balances WHERE user_id = ${userId}::uuid
      `);
      const ledger = await tx
        .select()
        .from(schema.loyaltyLedger)
        .where(eq(schema.loyaltyLedger.userId, userId))
        .orderBy(desc(schema.loyaltyLedger.createdAt));
      return {
        currentBalance: bal[0]?.current_balance ?? 0,
        activeBalance: bal[0]?.active_balance ?? 0,
        ledger,
      };
    });
  }

  async createReview(userId: string, input: { orderId: string; rating: number; comment?: string }) {
    return withTx({ role: 'customer', userId }, async (tx) => {
      const [order] = await tx
        .select({ id: schema.orders.id, status: schema.orders.status })
        .from(schema.orders)
        .where(and(eq(schema.orders.id, input.orderId), eq(schema.orders.userId, userId)))
        .limit(1);
      if (!order) return { error: 'not_found' as const };
      if (order.status !== 'delivered') return { error: 'not_delivered' as const };

      const [review] = await tx
        .insert(schema.reviews)
        .values({ orderId: input.orderId, userId, rating: input.rating, comment: input.comment ?? null })
        .returning();
      return { review };
    });
  }

  async recordConsent(userId: string, input: { type: string; granted: boolean; source: string; version: string }) {
    return withTx({ role: 'customer', userId }, async (tx) => {
      const [consent] = await tx
        .insert(schema.consents)
        .values({ userId, type: input.type, granted: input.granted, source: input.source, version: input.version })
        .returning();
      return consent;
    });
  }
}
