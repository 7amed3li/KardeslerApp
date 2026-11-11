import crypto from 'node:crypto';
import type {
  PaymentInitRequest,
  PaymentInitResponse,
  PaymentProvider,
  PaymentWebhookInput,
} from '../../ports/providers.js';

export function computeWebhookHmac(
  providerEventId: string,
  orderId: string,
  amountKurus: number,
  status: 'paid' | 'failed',
  secret: string,
): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${providerEventId}:${orderId}:${amountKurus}:${status}`)
    .digest('hex');
}

export class FakePaymentProvider implements PaymentProvider {
  public readonly providerName = 'iyzico';

  constructor(private readonly webhookSecret: string) {}

  async initializePayment(req: PaymentInitRequest): Promise<PaymentInitResponse> {
    return {
      paymentPageUrl: `https://fake-gateway.local/checkout?token=fake_tok_${req.orderId}`,
      token: `fake_tok_${req.orderId}`,
    };
  }

  verifyWebhook(payload: PaymentWebhookInput): boolean {
    const expected = computeWebhookHmac(
      payload.providerEventId,
      payload.orderId,
      payload.amountKurus,
      payload.status,
      this.webhookSecret,
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
  public readonly providerName = 'iyzico';

  constructor(
    private readonly apiKey: string,
    private readonly secretKey: string,
    private readonly baseUrl = 'https://sandbox-api.iyzipay.com',
  ) {}

  async initializePayment(req: PaymentInitRequest): Promise<PaymentInitResponse> {
    void this.apiKey;
    return {
      paymentPageUrl: `${this.baseUrl}/checkout/${req.orderId}`,
      token: `iyzi_token_${req.orderId}`,
    };
  }

  verifyWebhook(payload: PaymentWebhookInput): boolean {
    const expected = computeWebhookHmac(
      payload.providerEventId,
      payload.orderId,
      payload.amountKurus,
      payload.status,
      this.secretKey,
    );
    const a = Buffer.from(payload.signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  async refundPayment(providerRef: string, _amountKurus: number): Promise<{ refundRef: string }> {
    return { refundRef: `iyzi_refund_${providerRef}` };
  }
}
