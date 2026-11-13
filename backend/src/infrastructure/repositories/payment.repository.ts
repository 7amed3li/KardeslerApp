import { eq } from 'drizzle-orm';
import { withTx, schema, type DbTx } from '../db/client.js';
import type { PaymentRepository } from '../../ports/repositories.js';
import { PaymentDomain } from '../../domain/payments/payment.domain.js';

interface WebhookTxParams {
  providerName: string;
  providerEventId: string;
  orderId: string;
  amountKurus: number;
  status: 'paid' | 'failed';
  providerRef: string;
  rawPayload: Record<string, unknown>;
  now: Date;
}

async function applyPaidOrFailedTx(
  tx: DbTx,
  order: typeof schema.orders.$inferSelect,
  params: WebhookTxParams,
) {
  const decision = PaymentDomain.decideWebhookOutcome({
    orderStatus: order.status,
    expectedTotalKurus: Number(order.totalKurus),
    receivedAmountKurus: params.amountKurus,
    webhookStatus: params.status,
  });

  if (decision.action === 'fraud_mismatch') {
    await tx.insert(schema.fraudFlags).values({
      userId: order.userId,
      orderId: order.id,
      flagType: 'PAYMENT_AMOUNT_MISMATCH',
      severity: 'critical',
      details: {
        expectedKurus: Number(order.totalKurus),
        receivedKurus: params.amountKurus,
        providerEventId: params.providerEventId,
      },
    });
    return { outcome: 'amount_mismatch' as const };
  }

  if (decision.action === 'mark_paid') {
    await tx
      .update(schema.payments)
      .set({ status: 'paid', providerRef: params.providerRef, providerEventId: params.providerEventId, paidAt: params.now })
      .where(eq(schema.payments.orderId, order.id));
    if (decision.nextOrderStatus) {
      await tx.update(schema.orders).set({ status: decision.nextOrderStatus }).where(eq(schema.orders.id, order.id));
    }
    return { outcome: 'activated' as const };
  }

  await tx
    .update(schema.payments)
    .set({ status: 'failed', providerRef: params.providerRef, providerEventId: params.providerEventId, failureReason: 'Payment failed at gateway' })
    .where(eq(schema.payments.orderId, order.id));
  return { outcome: 'failed' as const, orderStatus: decision.nextOrderStatus };
}

export class PostgresPaymentRepository implements PaymentRepository {
  async processWebhookEvent(params: WebhookTxParams) {
    return withTx({ role: 'system' }, async (tx) => {
      const existing = await tx
        .select({ id: schema.paymentEvents.id })
        .from(schema.paymentEvents)
        .where(eq(schema.paymentEvents.providerEventId, params.providerEventId))
        .limit(1);
      if (existing.length > 0) return { outcome: 'idempotent_replay' as const };

      const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, params.orderId)).limit(1);
      if (!order) return { outcome: 'not_found' as const };

      await tx.insert(schema.paymentEvents).values({
        provider: params.providerName,
        providerEventId: params.providerEventId,
        orderId: order.id,
        eventType: `payment.${params.status}`,
        rawPayload: params.rawPayload,
        signatureValid: true,
      });

      return applyPaidOrFailedTx(tx, order, params);
    });
  }

  async markOrderRefundSucceeded(params: {
    orderId: string;
    reason: string;
    initiatedBy: string;
    refundRef: string;
    now: Date;
  }): Promise<boolean> {
    return withTx({ role: 'system' }, async (tx) => {
      const [pay] = await tx.select().from(schema.payments).where(eq(schema.payments.orderId, params.orderId)).limit(1);
      if (!pay || !PaymentDomain.shouldAutoRefund(pay.method, pay.status)) return false;

      await tx.insert(schema.refunds).values({
        paymentId: pay.id,
        orderId: params.orderId,
        amountKurus: Number(pay.amountKurus),
        reason: params.reason,
        status: 'succeeded',
        providerRef: params.refundRef,
        initiatedBy: params.initiatedBy,
        completedAt: params.now,
      });
      await tx.update(schema.payments).set({ status: 'refunded' }).where(eq(schema.payments.id, pay.id));
      return true;
    });
  }

  async getOrderPaymentForCheckout(userId: string, orderId: string) {
    return withTx({ role: 'customer', userId }, async (tx) => {
      const [order] = await tx
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, orderId))
        .limit(1);
      if (!order) return null;
      return {
        totalKurus: Number(order.totalKurus),
        customerName: order.customerNameSnapshot,
        customerPhone: order.customerPhoneSnapshot,
        status: order.status,
      };
    });
  }
}
