import type { MenuItemDto } from '../src/api/types';
import { quoteCart } from '../src/features/cart/api/cart.api';
import { buildLineKey, getProvisionalItemCount, useCartStore } from '../src/features/cart/model/cart.store';
import {
  filterMenuItems,
  groupMenuItemOptions,
  validateOptionSelection,
} from '../src/features/menu/model/menu.model';

const SAMPLE_ITEMS: MenuItemDto[] = [
  {
    id: 'item-1',
    categoryId: 'cat-1',
    priceKurus: 34000,
    vatRatePercent: 1,
    imageUrl: null,
    isAvailable: true,
    sortOrder: 1,
    allergens: ['gluten'],
    name: 'Zırh Kıyma Adana Kebap',
    description: 'Acılı kebap',
    options: [
      {
        id: 'opt-1',
        groupId: 'grp-1',
        menuItemId: 'item-1',
        minSelect: 1,
        maxSelect: 1,
        isRequired: true,
        groupName: 'Porsiyon',
        priceDeltaKurus: 0,
        isAvailable: true,
        name: '1 Porsiyon',
      },
      {
        id: 'opt-2',
        groupId: 'grp-1',
        menuItemId: 'item-1',
        minSelect: 1,
        maxSelect: 1,
        isRequired: true,
        groupName: 'Porsiyon',
        priceDeltaKurus: 16000,
        isAvailable: true,
        name: '1.5 Porsiyon',
      },
    ],
  },
  {
    id: 'item-2',
    categoryId: 'cat-2',
    priceKurus: 18000,
    vatRatePercent: 1,
    imageUrl: null,
    isAvailable: false,
    sortOrder: 2,
    allergens: ['dairy'],
    name: 'Hatay Künefe',
    description: 'Sıcak tatlı',
    options: [],
  },
];

describe('Phase 3 Menu & Cart', () => {
  beforeEach(() => {
    useCartStore.getState().clearCart();
  });

  it('validates required option groups and maxSelect', () => {
    const groups = groupMenuItemOptions(SAMPLE_ITEMS[0]!.options);
    expect(groups).toHaveLength(1);
    expect(validateOptionSelection(groups, [])).toEqual({
      valid: false,
      missingGroupName: 'Porsiyon',
    });
    expect(validateOptionSelection(groups, ['opt-1'])).toEqual({ valid: true });
    expect(validateOptionSelection(groups, ['opt-1', 'opt-2'])).toEqual({
      valid: false,
      missingGroupName: 'Porsiyon',
    });
  });

  it('filters menu items by category, Turkish search, and favorites', () => {
    expect(
      filterMenuItems({
        items: SAMPLE_ITEMS,
        categoryId: null,
        searchQuery: 'ADANA',
        favoritesOnly: false,
        favoriteIds: [],
      }),
    ).toHaveLength(1);

    expect(
      filterMenuItems({
        items: SAMPLE_ITEMS,
        categoryId: 'cat-2',
        searchQuery: '',
        favoritesOnly: true,
        favoriteIds: ['item-2'],
      }),
    ).toHaveLength(1);
  });

  it('supports cart add, quantity update, remove, and undo', () => {
    const store = useCartStore.getState();
    store.addItem({
      menuItemId: 'item-1',
      name: 'Adana',
      imageUrl: null,
      quantity: 1,
      optionIds: ['opt-1'],
      optionNames: ['1 Porsiyon'],
    });
    expect(getProvisionalItemCount(useCartStore.getState().items)).toBe(1);

    const key = buildLineKey('item-1', ['opt-1']);
    store.updateQuantity(key, 1);
    expect(getProvisionalItemCount(useCartStore.getState().items)).toBe(2);

    store.removeItem(key);
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(useCartStore.getState().lastRemoved?.lineKey).toBe(key);

    store.undoRemove();
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().lastRemoved).toBeNull();
  });

  it('calls POST /api/v1/orders/quote as single source of truth', async () => {
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          subtotal_kurus: 34000,
          discount_kurus: 5000,
          delivery_fee_kurus: 2500,
          total_kurus: 31500,
          min_order_kurus_applied: 25000,
          is_min_order_met: true,
          min_order_shortfall_kurus: 0,
          coupon_applied: { code: 'HOSGELDIN50', discount_kurus: 5000 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const quote = await quoteCart({
      items: [
        {
          lineKey: 'k1',
          menuItemId: 'item-1',
          name: 'Adana',
          imageUrl: null,
          quantity: 1,
          optionIds: ['opt-1'],
          optionNames: ['1 Porsiyon'],
        },
      ],
      orderType: 'delivery',
      couponCode: 'HOSGELDIN50',
      lat: 41.0315,
      lng: 28.9845,
    });
    expect(quote.total_kurus).toBe(31500);
    expect(quote.is_min_order_met).toBe(true);
  });
});

