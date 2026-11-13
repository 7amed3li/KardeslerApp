import { and, desc, eq, sql } from 'drizzle-orm';
import type { OrderStatus } from '@kardesler/shared';
import { withTx, schema, type DbTx } from '../db/client.js';
import type { OrderRepository, OrderSummaryRecord } from '../../ports/repositories.js';
import { OrderStateMachine } from '../../domain/orders/order-state-machine.js';
import { LoyaltyDomain } from '../../domain/loyalty/loyalty.domain.js';
import { DomainError } from '../../domain/errors.js';

function toSummary(o: typeof schema.orders.$inferSelect): OrderSummaryRecord {
  return {
    id: o.id,
    userId: o.userId,
    orderNumber: o.orderNumber,
    businessDate: o.businessDate,
    orderType: o.orderType as 'delivery' | 'pickup',
    status: o.status as OrderStatus,
    subtotalKurus: Number(o.subtotalKurus),
    discountKurus: Number(o.discountKurus),
    deliveryFeeKurus: Number(o.deliveryFeeKurus),
    totalKurus: Number(o.totalKurus),
    paymentMethod: o.paymentMethod as 'card_online' | 'cash_on_delivery',
    customerNameSnapshot: o.customerNameSnapshot,
    customerPhoneSnapshot: o.customerPhoneSnapshot,
    addressSnapshot: o.addressSnapshot,
    customerNote: o.customerNote,
    createdAt: o.createdAt,
  };
}

async function awardDeliveryLoyaltyTx(
  tx: DbTx,
  order: typeof schema.orders.$inferSelect,
  now: Date,
): Promise<void> {
  if (!order.userId) return;
  const pendingRefs = await tx
    .select()
    .from(schema.referrals)
    .where(and(eq(schema.referrals.referredUserId, order.userId), eq(schema.referrals.status, 'pending')))
    .limit(1);

  const rewards = LoyaltyDomain.calculateDeliveryRewards(
    Number(order.totalKurus),
    pendingRefs.length > 0,
  );

  if (rewards.orderPoints > 0) {
    await tx.insert(schema.loyaltyLedger).values({
      userId: order.userId,
      points: rewards.orderPoints,
      reason: `Sipariş #${order.orderNumber} teslimat puanı`,
      orderId: order.id,
    });
  }

  if (pendingRefs.length > 0) {
    const ref = pendingRefs[0];
    await tx
      .update(schema.referrals)
      .set({ status: 'rewarded', orderId: order.id, rewardedAt: now })
      .where(eq(schema.referrals.id, ref.id));

    await tx.insert(schema.loyaltyLedger).values([
      {
        userId: ref.referrerUserId,
        points: rewards.referrerBonusPoints,
        reason: 'Arkadaş davet ödülü (Referrer bonus)',
        orderId: order.id,
      },
      {
        userId: ref.referredUserId,
        points: rewards.referredBonusPoints,
        reason: 'Hoş geldin davet ödülü (Referred bonus)',
        orderId: order.id,
      },
    ]);
  }
}

export class PostgresOrderRepository implements OrderRepository {
  async createViaStoredFn(userId: string, input: {
    orderType: 'delivery' | 'pickup';
    paymentMethod: 'card_online' | 'cash_on_delivery';
    idempotencyKey: string;
    items: { menu_item_id: string; quantity: number; option_ids: string[] }[];
    addressId?: string;
    addressSnapshot?: unknown;
    couponCode?: string;
    customerNote?: string;
  }): Promise<OrderSummaryRecord> {
    return withTx({ role: 'customer', userId }, async (tx) => {
      const itemsJson = JSON.stringify(input.items);
      const addrJson = input.addressSnapshot ? JSON.stringify(input.addressSnapshot) : null;
      const res = await tx.execute<{ order_id: string }>(sql`
        SELECT public.create_order(
          ${input.orderType}::text, ${input.paymentMethod}::text, ${input.idempotencyKey}::text,
          ${itemsJson}::jsonb, ${input.addressId ?? null}::uuid, ${addrJson}::jsonb,
          ${input.couponCode ?? null}::text, ${input.customerNote ?? null}::text
        ) AS order_id
      `);
      const [row] = await tx.select().from(schema.orders).where(eq(schema.orders.id, res[0].order_id)).limit(1);
      return toSummary(row);
    });
  }

  async listCustomerOrders(userId: string): Promise<unknown[]> {
    return withTx({ role: 'customer', userId }, async (tx) =>
      tx.select().from(schema.orders).orderBy(desc(schema.orders.createdAt)),
    );
  }

  async getCustomerOrderDetail(userId: string, orderId: string) {
    return withTx({ role: 'customer', userId }, async (tx) => {
      const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).limit(1);
      if (!order) return null;
      const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
      const events = await tx.select().from(schema.orderEvents).where(eq(schema.orderEvents.orderId, orderId));
      return { order, items, events };
    });
  }

  async cancelCustomerOrder(userId: string, orderId: string, reason: string) {
    return withTx({ role: 'customer', userId, actorType: 'customer', actorId: userId }, async (tx) => {
      // Plain SELECT uses FOR SELECT RLS so we distinguish missing/foreign (404) from non-cancellable state (409)
      const [existing] = await tx.select({ id: schema.orders.id, status: schema.orders.status }).from(schema.orders).where(eq(schema.orders.id, orderId)).limit(1);
      if (!existing) throw new DomainError('NOT_FOUND', 404, 'Sipariş bulunamadı');
      OrderStateMachine.assertCustomerCanCancel(existing.status as OrderStatus);

      // Acquire row lock; if staff transitioned state concurrently, pol_orders_customer_cancel filters the row out
      const locked = await tx.execute<{ id: string; status: string }>(sql`
        SELECT id, status FROM public.orders WHERE id = ${orderId}::uuid FOR UPDATE
      `);
      if (locked.length === 0) {
        throw new DomainError('INVALID_STATE_TRANSITION', 409, 'Sipariş artık iptal edilemez');
      }

      const [updated] = await tx
        .update(schema.orders)
        .set({ status: 'cancelled', cancelReason: reason })
        .where(eq(schema.orders.id, orderId))
        .returning();
      if (!updated) {
        throw new DomainError('INVALID_STATE_TRANSITION', 409, 'Sipariş artık iptal edilemez');
      }

      const [pay] = await tx.select().from(schema.payments).where(eq(schema.payments.orderId, orderId)).limit(1);
      return { order: toSummary(updated), wasPaidCard: pay?.method === 'card_online' && pay?.status === 'paid' };
    });
  }

  async buildReorderPreview(userId: string, orderId: string) {
    return withTx({ role: 'customer', userId }, async (tx) => {
      const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).limit(1);
      if (!order) return null;
      const prevItems = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
      const availableItems: unknown[] = [];
      const unavailableItems: unknown[] = [];
      const priceChanges: unknown[] = [];
      let newSubtotalKurus = 0;

      for (const pItem of prevItems) {
        const [cur] = await tx.select().from(schema.menuItems).where(eq(schema.menuItems.id, pItem.menuItemId)).limit(1);
        if (!cur || cur.deletedAt || !cur.isAvailable) {
          unavailableItems.push({ menuItemId: pItem.menuItemId, name: pItem.nameSnapshot });
          continue;
        }
        const oldUnit = Number(pItem.unitPriceSnapshotKurus);
        const newUnit = Number(cur.priceKurus);
        if (oldUnit !== newUnit) {
          priceChanges.push({ menuItemId: pItem.menuItemId, name: pItem.nameSnapshot, oldPriceKurus: oldUnit, newPriceKurus: newUnit });
        }
        const lineTotal = newUnit * pItem.quantity;
        newSubtotalKurus += lineTotal;
        availableItems.push({ menuItemId: pItem.menuItemId, name: pItem.nameSnapshot, quantity: pItem.quantity, unitPriceKurus: newUnit, lineTotalKurus: lineTotal });
      }
      return { sourceOrderId: order.id, availableItems, unavailableItems, priceChanges, newSubtotalKurus };
    });
  }

  async listStaffOrders(staffId: string, role: 'staff' | 'owner') {
    return withTx({ role, staffId }, async (tx) => tx.select().from(schema.orders).orderBy(desc(schema.orders.createdAt)));
  }

  async transitionOrderAsStaff(params: {
    staffId: string;
    role: 'staff' | 'owner';
    orderId: string;
    toStatus: OrderStatus;
    cancelReason?: string;
    now: Date;
  }) {
    return withTx({ role: params.role, staffId: params.staffId, actorType: 'staff', actorId: params.staffId }, async (tx) => {
      const locked = await tx.execute<{ id: string; status: string }>(sql`
        SELECT id, status FROM public.orders WHERE id = ${params.orderId}::uuid FOR UPDATE
      `);
      if (locked.length === 0) throw new DomainError('NOT_FOUND', 404, 'Sipariş bulunamadı');
      OrderStateMachine.assertTransition(locked[0].status as OrderStatus, params.toStatus);

      const [order] = await tx
        .update(schema.orders)
        .set({ status: params.toStatus, ...(params.cancelReason ? { cancelReason: params.cancelReason } : {}) })
        .where(eq(schema.orders.id, params.orderId))
        .returning();
      if (!order) throw new DomainError('NOT_FOUND', 404, 'Sipariş bulunamadı');

      let shouldRefundPaidCard = false;
      let paymentProviderRef: string | null = null;
      let paymentAmountKurus = 0;

      if (params.toStatus === 'cancelled' || params.toStatus === 'rejected') {
        const [pay] = await tx.select().from(schema.payments).where(eq(schema.payments.orderId, order.id)).limit(1);
        if (pay && pay.method === 'card_online' && pay.status === 'paid') {
          shouldRefundPaidCard = true;
          paymentProviderRef = pay.providerRef ?? pay.id;
          paymentAmountKurus = Number(pay.amountKurus);
        }
      }

      if (params.toStatus === 'delivered') {
        await awardDeliveryLoyaltyTx(tx, order, params.now);
      }

      return { order: toSummary(order), shouldRefundPaidCard, paymentProviderRef, paymentAmountKurus };
    });
  }

  async assignDriver(staffId: string, role: 'staff' | 'owner', orderId: string, driverId: string) {
    return withTx({ role, staffId }, async (tx) => {
      const [order] = await tx.update(schema.orders).set({ driverId }).where(eq(schema.orders.id, orderId)).returning();
      return order ?? null;
    });
  }

  async createReprintJob(staffId: string, role: 'staff' | 'owner', orderId: string) {
    return withTx({ role, staffId }, async (tx) => {
      const [job] = await tx.insert(schema.printJobs).values({ orderId, kind: 'reprint', status: 'pending' }).returning();
      return job;
    });
  }

  async searchStaffOrders(staffId: string, role: 'staff' | 'owner', query: string) {
    return withTx({ role, staffId }, async (tx) => {
      const q = `%${query.trim()}%`;
      const rows = await tx.execute(sql`
        SELECT id, order_number AS "orderNumber", business_date AS "businessDate",
          status, order_type AS "orderType", payment_method AS "paymentMethod",
          customer_name_snapshot AS "customerName", customer_phone_snapshot AS "customerPhone",
          subtotal_kurus::bigint AS "subtotalKurus", total_kurus::bigint AS "totalKurus",
          created_at AS "createdAt"
        FROM public.orders
        WHERE (customer_phone_snapshot ILIKE ${q}
           OR customer_name_snapshot ILIKE ${q}
           OR order_number::text ILIKE ${q})
          AND (
            public.app_current_role() IN ('owner', 'system')
            OR status <> 'awaiting_payment'
          )
        ORDER BY created_at DESC
        LIMIT 50
      `);
      return [...rows];
    });
  }
}

