import { type OrderStatus } from '@kardesler/shared';

export class OrderStateMachine {
  private static readonly ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
    awaiting_payment: ['new', 'cancelled'],
    new: ['accepted', 'rejected', 'cancelled'],
    accepted: ['on_the_way', 'cancelled'],
    on_the_way: ['delivered', 'cancelled'],
    delivered: [], // Terminal
    cancelled: [], // Terminal
    rejected: [], // Terminal
  };

  /**
   * Validates whether transition from current status to target status is permitted.
   */
  public static canTransition(from: OrderStatus, to: OrderStatus): boolean {
    const allowed = this.ALLOWED_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  /**
   * Asserts transition validity, throwing an informative error if illegal.
   */
  public static assertTransition(from: OrderStatus, to: OrderStatus): void {
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Geçersiz sipariş durum geçişi: "${from}" durumundan "${to}" durumuna geçilemez.`,
      );
    }
  }

  public static isTerminal(status: OrderStatus): boolean {
    return ['delivered', 'cancelled', 'rejected'].includes(status);
  }
}
