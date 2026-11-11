import type { Clock } from '../../ports/clock.js';
import type { PushProvider } from '../../ports/providers.js';
import type { BackgroundJobRepository } from '../../ports/repositories.js';
import type { EventBusPort } from '../../ports/state.js';

export class BackgroundJobsUseCases {
  constructor(
    private readonly repo: BackgroundJobRepository,
    private readonly eventBus: EventBusPort,
    private readonly push: PushProvider,
    private readonly clock: Clock,
  ) {}

  async expireUnpaidCardOrders() {
    return this.repo.expireUnpaidCardOrders();
  }

  async checkUnacceptedOrdersAlert() {
    const orders = await this.repo.findUnacceptedOrdersPastThreshold();
    for (const row of orders) {
      await this.eventBus.publish('order.unaccepted_alert', {
        orderId: row.id,
        orderNumber: row.orderNumber,
      });
    }
    return { alertedOrderIds: orders.map((r) => r.id) };
  }

  async reconcilePendingPayments() {
    const reconciledCount = await this.repo.reconcileStalePendingPayments();
    return { reconciledCount };
  }

  async cleanupExpiredAuthRecords() {
    return this.repo.cleanupExpiredAuthRecords();
  }

  async retryFailedNotifications() {
    const pending = await this.repo.listFailedNotifications(20);
    let retriedCount = 0;
    for (const n of pending) {
      try {
        const res = await this.push.send({
          pushToken: n.pushToken,
          title: n.title,
          body: n.body,
          data: (n.data ?? undefined) as Record<string, unknown> | undefined,
        });
        await this.repo.markNotificationRetryResult(n.id, true, res.ticketId, this.clock.now());
        retriedCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Push delivery failed';
        await this.repo.markNotificationRetryResult(n.id, false, msg, this.clock.now());
      }
    }
    return { retriedCount };
  }
}

