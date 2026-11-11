import { eq, sql } from 'drizzle-orm';
import { apiClient, withTx, schema } from '../db/client.js';
import type { PrintRepository, SettingsRepository } from '../../ports/repositories.js';

export class PostgresPrintRepository implements PrintRepository {
  async recordHeartbeatAndPollPending(deviceId: string, now: Date) {
    return withTx({ role: 'print_agent' }, async (tx) => {
      await tx
        .insert(schema.heartbeats)
        .values({ deviceId, kind: 'print_agent', lastSeenAt: now, meta: { polledAt: now.toISOString() } })
        .onConflictDoUpdate({ target: schema.heartbeats.deviceId, set: { lastSeenAt: now } });

      const pendingJobs = await tx
        .select()
        .from(schema.printJobs)
        .where(eq(schema.printJobs.status, 'pending'))
        .orderBy(schema.printJobs.createdAt)
        .limit(10);

      const results = [];
      for (const job of pendingJobs) {
        const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, job.orderId)).limit(1);
        if (!order) continue;
        const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
        const formattedItems = [];
        for (const item of items) {
          const opts = await tx.select().from(schema.orderItemOptions).where(eq(schema.orderItemOptions.orderItemId, item.id));
          formattedItems.push({
            quantity: item.quantity,
            nameTr: item.nameSnapshot,
            unitPriceKurus: Number(item.unitPriceSnapshotKurus),
            lineTotalKurus: Number(item.lineTotalKurus),
            options: opts.map((o) => ({ nameTr: o.nameSnapshot, priceDeltaKurus: Number(o.priceDeltaSnapshotKurus) })),
          });
        }
        const addrObj = (order.addressSnapshot ?? {}) as Record<string, unknown>;
        const addressText =
          typeof addrObj.full_address === 'string'
            ? addrObj.full_address
            : typeof addrObj.street === 'string'
              ? `${addrObj.street} No:${addrObj.building ?? ''}`
              : null;

        results.push({
          jobId: job.id,
          orderId: order.id,
          orderNumber: order.orderNumber,
          businessDate: order.businessDate,
          orderType: order.orderType as 'delivery' | 'pickup',
          paymentMethod: order.paymentMethod as 'card_online' | 'cash_on_delivery',
          customerName: order.customerNameSnapshot,
          customerPhone: order.customerPhoneSnapshot,
          addressText,
          customerNote: order.customerNote,
          kind: job.kind,
          items: formattedItems,
          subtotalKurus: Number(order.subtotalKurus),
          discountKurus: Number(order.discountKurus),
          totalKurus: Number(order.totalKurus),
          createdAt: order.createdAt,
        });
      }
      return results;
    });
  }

  async ackPrintJob(jobId: string, input: { status: 'printed' | 'failed'; error?: string; now: Date }) {
    return withTx({ role: 'print_agent' }, async (tx) => {
      const [row] = await tx
        .update(schema.printJobs)
        .set({
          status: input.status,
          printedAt: input.status === 'printed' ? input.now : null,
          lastError: input.error ?? null,
          attempts: sql`${schema.printJobs.attempts} + 1`,
        })
        .where(eq(schema.printJobs.id, jobId))
        .returning();
      return row ?? null;
    });
  }
}

export class PostgresSettingsRepository implements SettingsRepository {
  async getPublicSettingsWithHeartbeats() {
    const rows = await apiClient`
      SELECT s.name, s.phone, s.address, s.is_accepting_orders AS "isAcceptingOrders",
        s.opening_hours AS "openingHours", s.min_app_version AS "minAppVersion",
        s.currency, s.cod_max_amount_kurus::int AS "codMaxAmountKurus",
        (SELECT count(*)::int FROM public.heartbeats) AS "totalHeartbeatsRegistered",
        (SELECT count(*)::int FROM public.heartbeats h
         WHERE h.last_seen_at >= clock_timestamp() - (s.heartbeat_grace_seconds || ' seconds')::interval
        ) AS "freshHeartbeats"
      FROM public.restaurant_settings s WHERE s.id = 1
    `;
    const s = rows[0];
    const heartbeatAlive = s.totalHeartbeatsRegistered === 0 || s.freshHeartbeats > 0;
    return {
      name: s.name,
      phone: s.phone,
      address: s.address,
      currency: s.currency,
      minAppVersion: s.minAppVersion,
      openingHours: s.openingHours,
      codMaxAmountKurus: s.codMaxAmountKurus,
      isAcceptingOrders: s.isAcceptingOrders,
      heartbeatAlive,
      orderingAvailable: Boolean(s.isAcceptingOrders && heartbeatAlive),
    };
  }

  async setAcceptingOrders(staffId: string, role: 'staff' | 'owner', isAcceptingOrders: boolean) {
    return withTx({ role, staffId }, async (tx) => {
      const [row] = await tx
        .update(schema.restaurantSettings)
        .set({ isAcceptingOrders })
        .where(eq(schema.restaurantSettings.id, 1))
        .returning();
      return { isAcceptingOrders: row.isAcceptingOrders };
    });
  }

  async recordHeartbeat(
    staffId: string,
    role: 'staff' | 'owner',
    input: { deviceId: string; kind: 'print_agent' | 'staff_tablet'; meta: Record<string, unknown>; now: Date },
  ) {
    await withTx({ role, staffId }, async (tx) => {
      await tx
        .insert(schema.heartbeats)
        .values({ deviceId: input.deviceId, kind: input.kind, lastSeenAt: input.now, meta: input.meta })
        .onConflictDoUpdate({ target: schema.heartbeats.deviceId, set: { lastSeenAt: input.now, meta: input.meta } });
    });
  }
}
