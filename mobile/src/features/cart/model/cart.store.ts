import type { OrderType } from '@kardesler/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface CartLineItem {
  lineKey: string;
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  optionIds: string[];
  optionNames: string[];
  note?: string;
}

interface CartStoreState {
  items: CartLineItem[];
  lastRemoved: CartLineItem | null;
  orderType: OrderType;
  couponCode: string | null;
  deliveryCoords: { lat: number; lng: number } | null;
  favoriteIds: string[];
  addItem: (item: Omit<CartLineItem, 'lineKey'>) => void;
  updateQuantity: (lineKey: string, delta: number) => void;
  removeItem: (lineKey: string) => void;
  undoRemove: () => void;
  clearCart: () => void;
  setOrderType: (type: OrderType) => void;
  setCouponCode: (code: string | null) => void;
  setDeliveryCoords: (coords: { lat: number; lng: number } | null) => void;
  toggleFavorite: (menuItemId: string) => void;
}

export function buildLineKey(menuItemId: string, optionIds: string[], note?: string): string {
  const sorted = [...optionIds].sort().join(',');
  return `${menuItemId}::${sorted}::${(note ?? '').trim()}`;
}

export const useCartStore = create<CartStoreState>()(
  persist(
    (set) => ({
      items: [],
      lastRemoved: null,
      orderType: 'delivery',
      couponCode: null,
      deliveryCoords: null,
      favoriteIds: [],

      addItem: (item) =>
        set((state) => {
          const lineKey = buildLineKey(item.menuItemId, item.optionIds, item.note);
          const existing = state.items.find((i) => i.lineKey === lineKey);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.lineKey === lineKey ? { ...i, quantity: i.quantity + item.quantity } : i,
              ),
              lastRemoved: null,
            };
          }
          return {
            items: [...state.items, { ...item, lineKey }],
            lastRemoved: null,
          };
        }),

      updateQuantity: (lineKey, delta) =>
        set((state) => {
          const target = state.items.find((i) => i.lineKey === lineKey);
          if (!target) return state;
          const nextQty = target.quantity + delta;
          if (nextQty <= 0) {
            return {
              items: state.items.filter((i) => i.lineKey !== lineKey),
              lastRemoved: target,
            };
          }
          return {
            items: state.items.map((i) =>
              i.lineKey === lineKey ? { ...i, quantity: nextQty } : i,
            ),
          };
        }),

      removeItem: (lineKey) =>
        set((state) => {
          const target = state.items.find((i) => i.lineKey === lineKey) ?? null;
          return {
            items: state.items.filter((i) => i.lineKey !== lineKey),
            lastRemoved: target,
          };
        }),

      undoRemove: () =>
        set((state) => {
          if (!state.lastRemoved) return state;
          return {
            items: [...state.items, state.lastRemoved],
            lastRemoved: null,
          };
        }),

      clearCart: () => set({ items: [], couponCode: null, lastRemoved: null }),

      setOrderType: (orderType) => set({ orderType }),

      setCouponCode: (couponCode) => set({ couponCode }),

      setDeliveryCoords: (deliveryCoords) => set({ deliveryCoords }),

      toggleFavorite: (menuItemId) =>
        set((state) => {
          const exists = state.favoriteIds.includes(menuItemId);
          return {
            favoriteIds: exists
              ? state.favoriteIds.filter((id) => id !== menuItemId)
              : [...state.favoriteIds, menuItemId],
          };
        }),
    }),
    {
      name: 'kc-cart-preferences',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        items: state.items,
        orderType: state.orderType,
        couponCode: state.couponCode,
        deliveryCoords: state.deliveryCoords,
        favoriteIds: state.favoriteIds,
      }),
    },
  ),
);

export function getProvisionalItemCount(items: CartLineItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

