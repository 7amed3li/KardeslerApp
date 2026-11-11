import { DomainError } from '../errors.js';

export type OrderStatusValue =
  | 'awaiting_payment'
  | 'new'
  | 'accepted'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled'
  | 'rejected';

export const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatusValue, readonly OrderStatusValue[]> = {
  awaiting_payment: ['new', 'cancelled'],
  new: ['accepted', 'rejected', 'cancelled'],
  accepted: ['on_the_way', 'cancelled'],
  on_the_way: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
  rejected: [],
};

export class OrderStateMachine {
  public static canTransition(from: OrderStatusValue, to: OrderStatusValue): boolean {
    const allowed = ALLOWED_ORDER_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  public static assertTransition(from: OrderStatusValue, to: OrderStatusValue): void {
    if (!this.canTransition(from, to)) {
      throw new DomainError(
        'INVALID_STATE_TRANSITION',
        409,
        `Geçersiz sipariş durum geçişi: "${from}" durumundan "${to}" durumuna geçilemez.`,
      );
    }
  }

  public static isTerminal(status: OrderStatusValue): boolean {
    return status === 'delivered' || status === 'cancelled' || status === 'rejected';
  }

  public static assertCustomerCanCancel(status: OrderStatusValue): void {
    if (status !== 'awaiting_payment' && status !== 'new') {
      throw new DomainError(
        'INVALID_STATE_TRANSITION',
        409,
        'Hazırlanmaya başlanmış siparişler müşteri tarafından iptal edilemez',
      );
    }
  }

  public static assertCodEligibility(params: {
    paymentMethod: 'card_online' | 'cash_on_delivery';
    totalKurus: number;
    maxAmountKurus: number;
    openCodOrdersCount: number;
    maxOpenCodOrders: number;
  }): void {
    if (params.paymentMethod !== 'cash_on_delivery') return;
    if (params.totalKurus > params.maxAmountKurus) {
      throw new DomainError(
        'COD_LIMIT_EXCEEDED',
        422,
        'Kapıda ödeme üst tutar limiti aşıldı',
      );
    }
    if (params.openCodOrdersCount >= params.maxOpenCodOrders) {
      throw new DomainError(
        'COD_LIMIT_EXCEEDED',
        422,
        'Maksimum açık kapıda ödeme sipariş sayısına ulaşıldı',
      );
    }
  }
}
