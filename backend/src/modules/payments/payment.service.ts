import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { withRlsTx, schema, type DbTx } from '../../db/index.js';
import { AppError } from '../../common/errors.js';

export interface PaymentInitializationRequest {
  orderId: string;
  amountKurus: number;
  customerName: string;
  customerPhone: string;
  callbackUrl: string;
}

export interface PaymentInitializationResponse {
  paymentPageUrl?: string;
  token: string;
}

export interface PaymentWebhookPayload {
  providerEventId: string;
  orderId: string;
  amountKurus: number;
  status: 'paid' | 'failed';
  providerRef: string;
  signature: string;
}

export interface PaymentProvider {
  initializePayment(req: PaymentInitializationRequest): Promise<PaymentInitializationResponse>;
  verifyWebhook(payload: PaymentWebhookPayload): boolean;
  refundPayment(providerRef: string, amountKurus: number): Promise<{ refundRef: string }>;
}

export function computeWebhookSignature(
  providerEventId: string,
  orderId: string,
  amountKurus: number,
  status: 'paid' | 'failed',
  secret = env.WEBHOOK_HMAC_SECRET,
): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${providerEventId}:${orderId}:${amountKurus}:${status}`)
    .digest('hex');
}

export class FakePaymentProvider implements PaymentProvider {
  async initializePayment(
    req: PaymentInitializationRequest,
  ): Promise<PaymentInitializationResponse> {
    return {
      paymentPageUrl: `https://fake-gateway.local/checkout?token=fake_tok_${req.orderId}`,
      token: `fake_tok_${req.orderId}`,
    };
  }

  verifyWebhook(payload: PaymentWebhookPayload): boolean {
    const expected = computeWebhookSignature(
      payload.providerEventId,
      payload.orderId,
      payload.amountKurus,
      payload.status,
    );
    const a = Buffer.from(payload.signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  async refundPayment(providerRef: string, _amountKurus: number): Promise<{ refundRef: string }> {
    return { refundRef: `fake_refund_${providerRef}_${Date.now()}` };
  }
}

export class IyzicoPaymentProvider implements PaymentProvider {
  constructor(
    private readonly apiKey: string,
    private readonly secretKey: string,
    private readonly baseUrl: string = 'https://sandbox-api.iyzipay.com',
  ) {}

  async initializePayment(
    req: PaymentInitializationRequest,
  ): Promise<PaymentInitializationResponse> {
    void this.apiKey;
    return {
      paymentPageUrl: `${this.baseUrl}/checkout/${req.orderId}`,
      token: `iyzi_token_${req.orderId}`,
    };
  }

  verifyWebhook(payload: PaymentWebhookPayload): boolean {
    const expectedSig = computeWebhookSignature(
      payload.providerEventId,
      payload.orderId,
      payload.amountKurus,
      payload.status,
      this.secretKey,
    );
    const a = Buffer.from(payload.signature);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  async refundPayment(providerRef: string, _amountKurus: number): Promise<{ refundRef: string }> {
    return { refundRef: `iyzi_refund_${providerRef}` };
  }
}

export class PaymentService {
  public static provider: PaymentProvider = new FakePaymentProvider();

  /**
   * Processes a signed payment webhook idempotently.
   * Verifies HMAC signature, logs raw payload in `payment_events`, verifies exact integer kuruş
   * amount against `orders.total_kurus`, and transitions `awaiting_payment -> new`.
   */
  public static async processWebhook(
    payload: PaymentWebhookPayload,
    onOrderActivated?: (orderId: string) => void,
  ): Promise<{ idempotentReplay: boolean; orderId: string; status: string }> {
    if (!this.provider.verifyWebhook(payload)) {
      throw new AppError('UNAUTHORIZED', 401, 'Geçersiz ödeme webhook imzası (Invalid HMAC)');
    }

    let amountMismatchDetected = false;

    const result = await withRlsTx({ role: 'system' }, async (tx) => {
      const existingEvents = await tx
        .select()
        .from(schema.paymentEvents)
        .where(eq(schema.paymentEvents.providerEventId, payload.providerEventId))
        .limit(1);

      if (existingEvents.length > 0) {
        return {
          idempotentReplay: true,
          orderId: payload.orderId,
          status: 'already_processed',
        };
      }

      const orderRows = await tx
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, payload.orderId))
        .limit(1);

      if (orderRows.length === 0) {
        throw new AppError('NOT_FOUND', 404, 'Ödeme bildirimi yapılan sipariş bulunamadı');
      }

      const order = orderRows[0];

      await tx.insert(schema.paymentEvents).values({
        provider: 'iyzico',
        providerEventId: payload.providerEventId,
        orderId: order.id,
        eventType: `payment.${payload.status}`,
        rawPayload: payload as unknown as Record<string, unknown>,
        signatureValid: true,
      });

      if (payload.status === 'paid' && Number(order.totalKurus) !== payload.amountKurus) {
        await tx.insert(schema.fraudFlags).values({
          userId: order.userId,
          orderId: order.id,
          flagType: 'PAYMENT_AMOUNT_MISMATCH',
          severity: 'critical',
          details: {
            expectedKurus: Number(order.totalKurus),
            receivedKurus: payload.amountKurus,
            providerEventId: payload.providerEventId,
          },
        });
        amountMismatchDetected = true;
        return {
          idempotentReplay: false,
          orderId: order.id,
          status: 'amount_mismatch',
        };
      }

      if (payload.status === 'paid') {
        await tx
          .update(schema.payments)
          .set({
            status: 'paid',
            providerRef: payload.providerRef,
            providerEventId: payload.providerEventId,
            paidAt: new Date(),
          })
          .where(eq(schema.payments.orderId, order.id));

        if (order.status === 'awaiting_payment') {
          await tx
            .update(schema.orders)
            .set({ status: 'new' })
            .where(eq(schema.orders.id, order.id));
        }

        return {
          idempotentReplay: false,
          orderId: order.id,
          status: 'new',
        };
      } else {
        await tx
          .update(schema.payments)
          .set({
            status: 'failed',
            providerRef: payload.providerRef,
            providerEventId: payload.providerEventId,
            failureReason: 'Payment failed at gateway',
          })
          .where(eq(schema.payments.orderId, order.id));

        return {
          idempotentReplay: false,
          orderId: order.id,
          status: order.status,
        };
      }
    });

    if (amountMismatchDetected) {
      throw new AppError(
        'PAYMENT_AMOUNT_MISMATCH',
        422,
        'Ödenen tutar sipariş toplamı ile eşleşmiyor',
      );
    }

    if (!result.idempotentReplay && result.status === 'new' && onOrderActivated) {
      onOrderActivated(result.orderId);
    }

    return result;
  }

  /**
   * Automatically refunds a paid online card order inside an active transaction when cancelled/rejected.
   */
  public static async refundOrderIfPaidInTx(
    tx: DbTx,
    orderId: string,
    reason: string,
    initiatedBy: string,
  ): Promise<boolean> {
    const paymentRows = await tx
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.orderId, orderId))
      .limit(1);

    if (paymentRows.length === 0) return false;
    const payment = paymentRows[0];

    if (payment.method !== 'card_online' || payment.status !== 'paid') {
      return false;
    }

    const { refundRef } = await this.provider.refundPayment(
      payment.providerRef ?? payment.id,
      Number(payment.amountKurus),
    );

    await tx.insert(schema.refunds).values({
      paymentId: payment.id,
      orderId,
      amountKurus: Number(payment.amountKurus),
      reason,
      status: 'succeeded',
      providerRef: refundRef,
      initiatedBy,
      completedAt: new Date(),
    });

    await tx
      .update(schema.payments)
      .set({ status: 'refunded' })
      .where(eq(schema.payments.id, payment.id));

    return true;
  }
}
