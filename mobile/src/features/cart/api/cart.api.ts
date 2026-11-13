import type { OrderType } from '@kardesler/shared';
import { apiClient, unwrapApiResponse } from '../../../api/client';
import type { QuoteResponseDto } from '../../../api/types';
import type { CartLineItem } from '../model/cart.store';

export async function quoteCart(params: {
  items: CartLineItem[];
  orderType: OrderType;
  couponCode?: string | null;
  lat?: number;
  lng?: number;
}): Promise<QuoteResponseDto> {
  return unwrapApiResponse<QuoteResponseDto>(
    apiClient.POST('/api/v1/orders/quote', {
      body: {
        items: params.items.map((i) => ({
          menu_item_id: i.menuItemId,
          quantity: i.quantity,
          option_ids: i.optionIds,
        })),
        order_type: params.orderType,
        ...(params.couponCode ? { coupon_code: params.couponCode } : {}),
        ...(params.lat !== undefined && params.lng !== undefined
          ? { lat: params.lat, lng: params.lng }
          : {}),
      },
    }) as Promise<{ data?: QuoteResponseDto; error?: unknown; response: Response }>,
  );
}

