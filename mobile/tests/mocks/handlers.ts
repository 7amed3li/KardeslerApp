import { http, HttpResponse } from 'msw';

export const TEST_API_BASE = 'http://127.0.0.1:4000';

export function apiError(code: string, message: string, status: number, requestId = 'req-test-1') {
  return HttpResponse.json({ error: { code, message, requestId } }, { status });
}

export const mockMenuResponse = {
  language: 'tr',
  categories: [
    { id: 'cat-1', sortOrder: 1, name: 'Kebaplar & Izgaralar', description: null },
    { id: 'cat-2', sortOrder: 2, name: 'Tatlılar', description: null },
  ],
  items: [
    {
      id: 'item-1',
      categoryId: 'cat-1',
      priceKurus: 34000,
      vatRatePercent: 1,
      imageUrl: '/images/adana.jpg',
      isAvailable: true,
      sortOrder: 1,
      allergens: ['gluten'],
      name: 'Zırh Kıyma Adana Kebap',
      description: 'Közlenmiş biber, domates ve sumaklı soğan ile',
      options: [
        {
          id: 'opt-1',
          groupId: 'grp-1',
          menuItemId: 'item-1',
          minSelect: 1,
          maxSelect: 1,
          isRequired: true,
          groupName: 'Porsiyon Seçimi',
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
          groupName: 'Porsiyon Seçimi',
          priceDeltaKurus: 16000,
          isAvailable: true,
          name: '1.5 Porsiyon (+160 TL)',
        },
      ],
    },
    {
      id: 'item-2',
      categoryId: 'cat-2',
      priceKurus: 18000,
      vatRatePercent: 1,
      imageUrl: '/images/kunefe.jpg',
      isAvailable: false,
      sortOrder: 2,
      allergens: ['dairy', 'gluten'],
      name: 'Hatay Usulü Sıcak Künefe',
      description: 'Tuzsuz peynirli sıcak künefe',
      options: [],
    },
  ],
};

export const mockPublicSettings = {
  name: 'Kardeşler Cihangir Kebap Salonu',
  phone: '+902122495555',
  address: 'Kılıçali Paşa Mah. Sıraselviler Cad. No:42 Cihangir, Beyoğlu, İstanbul',
  currency: 'TRY',
  minAppVersion: '1.0.0',
  openingHours: {
    monday: { open: '09:00', close: '02:00' },
    tuesday: { open: '09:00', close: '02:00' },
    wednesday: { open: '09:00', close: '02:00' },
    thursday: { open: '09:00', close: '02:00' },
    friday: { open: '09:00', close: '03:00' },
    saturday: { open: '09:00', close: '03:00' },
    sunday: { open: '09:00', close: '02:00' },
  },
  codMaxAmountKurus: 150000,
  isAcceptingOrders: true,
  heartbeatAlive: true,
  orderingAvailable: true,
};

export const handlers = [
  http.get(`${TEST_API_BASE}/api/v1/menu`, () => HttpResponse.json(mockMenuResponse)),
  http.get(`${TEST_API_BASE}/api/v1/settings/public`, () => HttpResponse.json(mockPublicSettings)),
  http.get(`${TEST_API_BASE}/api/v1/banners`, () => HttpResponse.json({ banners: [] })),
  http.post(`${TEST_API_BASE}/api/v1/delivery/check`, async ({ request }) => {
    const body = (await request.json()) as { lat: number; lng: number };
    const inCihangir = body.lat >= 41.02 && body.lat <= 41.04 && body.lng >= 28.97 && body.lng <= 28.995;
    if (!inCihangir) {
      return HttpResponse.json({ covered: false, zone: null });
    }
    return HttpResponse.json({
      covered: true,
      zone: {
        id: 'zone-1',
        name: 'Cihangir Yakın Çevre',
        minOrderKurus: 25000,
        deliveryFeeKurus: 2500,
        estimatedMinutes: 30,
      },
    });
  }),
  http.post(`${TEST_API_BASE}/api/v1/auth/customer/otp/request`, async ({ request }) => {
    const body = (await request.json()) as { phone: string };
    if (!/^\+905\d{9}$/.test(body.phone)) {
      return apiError('VALIDATION_ERROR', 'Geçersiz telefon numarası', 400);
    }
    return HttpResponse.json({ expiresInSeconds: 300 });
  }),
  http.post(`${TEST_API_BASE}/api/v1/auth/customer/otp/verify`, async ({ request }) => {
    const body = (await request.json()) as { phone: string; code: string };
    if (body.code !== '145300') {
      return apiError('UNAUTHORIZED', 'Geçersiz doğrulama kodu', 401);
    }
    return HttpResponse.json({
      accessToken: 'access-token-1',
      refreshToken: 'refresh-token-1',
      user: {
        id: 'user-1',
        phone: body.phone,
        name: 'Test Müşteri',
        referralCode: 'KC1234AB',
      },
    });
  }),
  http.post(`${TEST_API_BASE}/api/v1/auth/customer/refresh`, () =>
    HttpResponse.json({
      accessToken: 'access-token-2',
      refreshToken: 'refresh-token-2',
    }),
  ),
  http.post(`${TEST_API_BASE}/api/v1/auth/customer/logout`, () =>
    HttpResponse.json({ loggedOut: true }),
  ),
  http.post(`${TEST_API_BASE}/api/v1/orders/quote`, async ({ request }) => {
    const body = (await request.json()) as {
      items: { menu_item_id: string; quantity: number; option_ids: string[] }[];
      order_type: 'delivery' | 'pickup';
      coupon_code?: string;
    };
    const subtotal = body.items.reduce((sum, item) => sum + 34000 * item.quantity, 0);
    const discount = body.coupon_code === 'HOSGELDIN50' ? 5000 : 0;
    const deliveryFee = body.order_type === 'delivery' ? 2500 : 0;
    const minOrder = body.order_type === 'delivery' ? 25000 : 0;
    const afterDiscount = Math.max(0, subtotal - discount);
    const shortfall = Math.max(0, minOrder - afterDiscount);
    return HttpResponse.json({
      subtotal_kurus: subtotal,
      discount_kurus: discount,
      delivery_fee_kurus: deliveryFee,
      total_kurus: afterDiscount + deliveryFee,
      min_order_kurus_applied: minOrder,
      is_min_order_met: shortfall === 0,
      min_order_shortfall_kurus: shortfall,
      coupon_applied: discount > 0 ? { code: body.coupon_code, discount_kurus: discount } : null,
    });
  }),
];

