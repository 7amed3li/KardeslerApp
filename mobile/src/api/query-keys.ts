import type { SupportedLanguage } from '@kardesler/shared';

export const queryKeys = {
  menu: (lang: SupportedLanguage) => ['menu', lang] as const,
  banners: ['banners'] as const,
  publicSettings: ['settings', 'public'] as const,
  addresses: ['addresses'] as const,
  orders: ['orders'] as const,
  orderDetail: (id: string) => ['orders', id] as const,
  loyalty: ['loyalty', 'me'] as const,
  referrals: ['referrals', 'me'] as const,
} as const;

