import type { OrderStatus } from '@kardesler/shared';

const TERMINAL_STATUSES = new Set<OrderStatus>(['delivered', 'cancelled', 'payment_failed']);
const CANCELLABLE_STATUSES = new Set<OrderStatus>(['awaiting_payment', 'pending']);

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function canCustomerCancelOrder(status: OrderStatus): boolean {
  return CANCELLABLE_STATUSES.has(status);
}

export function getOrderPollingIntervalMs(status: OrderStatus | undefined, errorCount: number): number | false {
  if (!status || isTerminalOrderStatus(status)) {
    return false;
  }
  const base = 12_000;
  if (errorCount <= 0) return base;
  return Math.min(60_000, base * Math.pow(2, errorCount));
}

export function generateIdempotencyKey(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `kc-ord-${Date.now().toString(36)}-${rand}`;
}

export interface ReorderPreviewPayload {
  availableItems?: {
    menuItemId: string;
    name: string;
    quantity: number;
    optionIds: string[];
  }[];
  unavailableItems?: { menuItemId: string; name: string; reason?: string }[];
  priceChanges?: { name: string; oldKurus: number; newKurus: number }[];
}
