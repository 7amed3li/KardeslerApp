import { DomainError } from '../../domain/errors.js';
import type { Clock } from '../../ports/clock.js';
import type { PaymentProvider, PaymentWebhookInput } from '../../ports/providers.js';
import type { PaymentRepository } from '../../ports/repositories.js';
import type { EventBusPort } from '../../ports/state.js';

export class PaymentsUseCases {
  constructor(
    private readonly paymentRepo: PaymentRepository,
    private readonly provider: PaymentProvider,
    private readonly eventBus: EventBusPort,
    private readonly clock: Clock,
  ) {}

  async processWebhook(payload: PaymentWebhookInput) {
    if (!this.provider.verifyWebhook(payload)) {
      throw new DomainError('UNAUTHORIZED', 401, 'Geçersiz ödeme webhook imzası (Invalid HMAC)');
    }

    const res = await this.paymentRepo.processWebhookEvent({
      providerName: this.provider.providerName,
      providerEventId: payload.providerEventId,
      orderId: payload.orderId,
      amountKurus: payload.amountKurus,
      status: payload.status,
      providerRef: payload.providerRef,
      rawPayload: payload as unknown as Record<string, unknown>,
      now: this.clock.now(),
    });

    if (res.outcome === 'idempotent_replay') {
      return { idempotentReplay: true, orderId: payload.orderId, status: 'already_processed' };
    }
    if (res.outcome === 'not_found') {
      throw new DomainError('NOT_FOUND', 404, 'Ödeme bildirimi yapılan sipariş bulunamadı');
    }
    if (res.outcome === 'amount_mismatch') {
      throw new DomainError('PAYMENT_AMOUNT_MISMATCH', 422, 'Ödenen tutar sipariş toplamı ile eşleşmiyor');
    }
    if (res.outcome === 'activated') {
      await this.eventBus.publish('order.created', {
        orderId: payload.orderId,
        status: 'new',
        source: 'payment_webhook',
      });
      return { idempotentReplay: false, orderId: payload.orderId, status: 'new' };
    }

    return { idempotentReplay: false, orderId: payload.orderId, status: res.orderStatus };
  }
}

