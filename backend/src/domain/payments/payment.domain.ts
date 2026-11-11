export interface WebhookDecisionInput {
  orderStatus: string;
  expectedTotalKurus: number;
  receivedAmountKurus: number;
  webhookStatus: 'paid' | 'failed';
}

export type WebhookDecision =
  | { action: 'fraud_mismatch' }
  | { action: 'mark_paid'; nextOrderStatus: string | null }
  | { action: 'mark_failed'; nextOrderStatus: string };

export class PaymentDomain {
  public static decideWebhookOutcome(input: WebhookDecisionInput): WebhookDecision {
    if (input.webhookStatus === 'paid' && input.expectedTotalKurus !== input.receivedAmountKurus) {
      return { action: 'fraud_mismatch' };
    }
    if (input.webhookStatus === 'paid') {
      return {
        action: 'mark_paid',
        nextOrderStatus: input.orderStatus === 'awaiting_payment' ? 'new' : null,
      };
    }
    return { action: 'mark_failed', nextOrderStatus: input.orderStatus };
  }

  public static shouldAutoRefund(paymentMethod: string, paymentStatus: string): boolean {
    return paymentMethod === 'card_online' && paymentStatus === 'paid';
  }
}
