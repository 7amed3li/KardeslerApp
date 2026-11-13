import { createOrder } from '../src/features/orders/api/orders.api';
import {
  canCustomerCancelOrder,
  generateIdempotencyKey,
  getOrderPollingIntervalMs,
  isTerminalOrderStatus,
} from '../src/features/orders/model/orders.model';

describe('Phase 4 Checkout & Orders', () => {
  it('detects terminal and cancellable order statuses', () => {
    expect(isTerminalOrderStatus('delivered')).toBe(true);
    expect(isTerminalOrderStatus('cancelled')).toBe(true);
    expect(isTerminalOrderStatus('rejected')).toBe(true);
    expect(isTerminalOrderStatus('accepted')).toBe(false);

    expect(canCustomerCancelOrder('new')).toBe(true);
    expect(canCustomerCancelOrder('awaiting_payment')).toBe(true);
    expect(canCustomerCancelOrder('accepted')).toBe(false);
  });

  it('uses adaptive polling interval with backoff and stops on terminal states', () => {
    expect(getOrderPollingIntervalMs('new', 0)).toBe(12000);
    expect(getOrderPollingIntervalMs('accepted', 1)).toBe(24000);
    expect(getOrderPollingIntervalMs('accepted', 3)).toBe(60000);
    expect(getOrderPollingIntervalMs('delivered', 0)).toBe(false);
  });

  it('sends idempotency-key header and body on createOrder', async () => {
    const key = generateIdempotencyKey();
    let capturedHeader: string | null = null;
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (input instanceof Request) {
        capturedHeader = input.headers.get('idempotency-key');
      }
      return new Response(
        JSON.stringify({
          id: 'ord-1',
          orderNumber: 42,
          businessDate: '2026-11-13',
          orderType: 'delivery',
          status: 'pending',
          subtotalKurus: 34000,
          discountKurus: 0,
          deliveryFeeKurus: 2500,
          totalKurus: 36500,
          paymentMethod: 'cash_on_delivery',
          paymentCheckout: null,
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const created = await createOrder({
      orderType: 'delivery',
      paymentMethod: 'cash_on_delivery',
      idempotencyKey: key,
      items: [{ menu_item_id: 'item-1', quantity: 1, option_ids: [] }],
      addressId: 'addr-1',
    });

    expect(capturedHeader).toBe(key);
    expect(created.orderNumber).toBe(42);
  });
});
