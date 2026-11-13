import type { OrderType, PaymentMethod } from '@kardesler/shared';
import { apiClient, unwrapApiResponse } from '../../../api/client';
import type {
  CreateOrderResponseDto,
  OrderDetailDto,
  OrderSummaryDto,
} from '../../../api/types';
import type { ReorderPreviewPayload } from '../model/orders.model';

export async function createOrder(input: {
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  items: { menu_item_id: string; quantity: number; option_ids: string[] }[];
  addressId?: string;
  couponCode?: string;
  customerNote?: string;
}): Promise<CreateOrderResponseDto> {
  return unwrapApiResponse<CreateOrderResponseDto>(
    apiClient.POST('/api/v1/orders', {
      headers: {
        'idempotency-key': input.idempotencyKey,
      },
      body: {
        order_type: input.orderType,
        payment_method: input.paymentMethod,
        idempotency_key: input.idempotencyKey,
        items: input.items,
        ...(input.addressId ? { address_id: input.addressId } : {}),
        ...(input.couponCode ? { coupon_code: input.couponCode } : {}),
        ...(input.customerNote ? { customer_note: input.customerNote } : {}),
      } as never,
    }) as Promise<{ data?: CreateOrderResponseDto; error?: unknown; response: Response }>,
  );
}

export async function listMyOrders(): Promise<{ orders: OrderSummaryDto[] }> {
  return unwrapApiResponse<{ orders: OrderSummaryDto[] }>(
    apiClient.GET('/api/v1/orders') as Promise<{
      data?: { orders: OrderSummaryDto[] };
      error?: unknown;
      response: Response;
    }>,
  );
}

export async function getMyOrderDetail(id: string): Promise<OrderDetailDto> {
  return unwrapApiResponse<OrderDetailDto>(
    apiClient.GET('/api/v1/orders/{id}', {
      params: { path: { id } } as never,
    }) as Promise<{ data?: OrderDetailDto; error?: unknown; response: Response }>,
  );
}

export async function cancelMyOrder(
  id: string,
  reason?: string,
): Promise<{ order: OrderSummaryDto; refunded: boolean }> {
  return unwrapApiResponse<{ order: OrderSummaryDto; refunded: boolean }>(
    apiClient.POST('/api/v1/orders/{id}/cancel', {
      params: { path: { id } } as never,
      body: (reason ? { reason } : {}) as never,
    }) as Promise<{
      data?: { order: OrderSummaryDto; refunded: boolean };
      error?: unknown;
      response: Response;
    }>,
  );
}

export async function previewReorder(id: string): Promise<ReorderPreviewPayload> {
  return unwrapApiResponse<ReorderPreviewPayload>(
    apiClient.POST('/api/v1/orders/{id}/reorder', {
      params: { path: { id } } as never,
    }) as Promise<{ data?: ReorderPreviewPayload; error?: unknown; response: Response }>,
  );
}

export async function createPaymentSession(id: string): Promise<{
  checkoutUrl: string;
  sessionId: string;
  expiresAt?: string;
}> {
  return unwrapApiResponse<{ checkoutUrl: string; sessionId: string; expiresAt?: string }>(
    apiClient.POST('/api/v1/orders/{id}/payment-session', {
      params: { path: { id } } as never,
    }) as Promise<{
      data?: { checkoutUrl: string; sessionId: string; expiresAt?: string };
      error?: unknown;
      response: Response;
    }>,
  );
}

export async function submitOrderReview(input: {
  orderId: string;
  rating: number;
  comment?: string;
}): Promise<{ review: unknown }> {
  return unwrapApiResponse<{ review: unknown }>(
    apiClient.POST('/api/v1/reviews', {
      body: input,
    }) as Promise<{ data?: { review: unknown }; error?: unknown; response: Response }>,
  );
}
