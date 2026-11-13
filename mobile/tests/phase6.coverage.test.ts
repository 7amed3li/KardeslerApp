import { bootstrapSession, createApiClient, resolveApiBaseUrl, sessionTokenStore } from '../src/api/client';
import { ApiClientError, normalizeApiError } from '../src/api/errors';
import { queryKeys } from '../src/api/query-keys';
import { useAuthStore } from '../src/features/auth/model/auth.store';
import { normalizeTurkishPhone } from '../src/features/auth/model/auth.validation';
import { buildLineKey, useCartStore } from '../src/features/cart/model/cart.store';
import { filterMenuItems } from '../src/features/menu/model/menu.model';
import { parseSafeDeepLink } from '../src/lib/deep-links';
import { logger } from '../src/lib/logger';
import { scrubSentryEvent } from '../src/lib/sentry';
import { secureStorage } from '../src/lib/secure-storage';

describe('Phase 6 Comprehensive Coverage & Edge Cases', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    useCartStore.getState().clearCart();
    useAuthStore.getState().clearAuth();
    sessionTokenStore.clearMemory();
    await secureStorage.clearRefreshToken();
  });

  it('redacts sensitive fields in logger without throwing', () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    logger.info('auth', { token: 'secret', nested: { authorization: 'Bearer abc', ok: 1 } });
    logger.warn('warn', { phone: '+905551112233' });
    logger.error('err');

    expect(warnSpy).toHaveBeenCalledWith('[KC] warn', { phone: '[REDACTED]' });
    expect(errSpy).toHaveBeenCalled();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('generates deterministic query keys', () => {
    expect(queryKeys.menu('tr')).toEqual(['menu', 'tr']);
    expect(queryKeys.orderDetail('o1')).toEqual(['orders', 'o1']);
    expect(queryKeys.banners).toEqual(['banners']);
    expect(queryKeys.publicSettings).toEqual(['settings', 'public']);
    expect(queryKeys.addresses).toEqual(['addresses']);
    expect(queryKeys.orders).toEqual(['orders']);
    expect(queryKeys.loyalty).toEqual(['loyalty', 'me']);
    expect(queryKeys.referrals).toEqual(['referrals', 'me']);
  });

  it('covers all cart store actions and branch paths', () => {
    const store = useCartStore.getState();
    store.setOrderType('pickup');
    store.setCouponCode('TEST50');
    store.setDeliveryCoords({ lat: 41.03, lng: 28.98 });
    store.toggleFavorite('item-1');
    store.toggleFavorite('item-1');

    store.addItem({
      menuItemId: 'item-1',
      name: 'Adana',
      imageUrl: null,
      quantity: 1,
      optionIds: ['o1'],
      optionNames: ['1 Porsiyon'],
      note: 'Acılı',
    });
    // Adding same item increments quantity
    store.addItem({
      menuItemId: 'item-1',
      name: 'Adana',
      imageUrl: null,
      quantity: 2,
      optionIds: ['o1'],
      optionNames: ['1 Porsiyon'],
      note: 'Acılı',
    });
    const key = buildLineKey('item-1', ['o1'], 'Acılı');
    expect(useCartStore.getState().items[0]?.quantity).toBe(3);

    // Decrement to 0 removes item and records lastRemoved
    store.updateQuantity(key, -3);
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(useCartStore.getState().lastRemoved?.lineKey).toBe(key);

    // Non-existent update & undo when empty & positive update
    store.updateQuantity('missing', 1);
    store.undoRemove();
    store.undoRemove();
    store.updateQuantity(key, 1);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0]?.quantity).toBe(4);
  });

  it('parses all whitelisted deep link routes and rejects invalid inputs', () => {
    expect(parseSafeDeepLink(null)).toBeNull();
    expect(parseSafeDeepLink('')).toBeNull();
    expect(parseSafeDeepLink('kardesler://')).toEqual({ route: '/(tabs)' });
    expect(parseSafeDeepLink('/menu')).toEqual({ route: '/(tabs)' });
    expect(parseSafeDeepLink('kardesler://cart')).toEqual({ route: '/(tabs)/cart' });
    expect(parseSafeDeepLink('kardesler://orders')).toEqual({ route: '/(tabs)/orders' });
    expect(parseSafeDeepLink('kardesler://profile')).toEqual({ route: '/(tabs)/profile' });
    expect(parseSafeDeepLink('kardesler://payment-return')).toEqual({
      route: '/payment-return',
      params: {},
    });
    expect(parseSafeDeepLink('kardesler://unknown/route')).toBeNull();
  });

  it('handles auth store updates, phone normalization, and menu search fallback', () => {
    expect(normalizeTurkishPhone('905321234567')).toBe('+905321234567');
    expect(normalizeTurkishPhone('123')).toBe('+123');

    // updateUser when user is null
    useAuthStore.getState().updateUser({ name: 'noop' });
    expect(useAuthStore.getState().user).toBeNull();

    useAuthStore.getState().setAuthenticated({
      id: 'u1',
      phone: '+905321234567',
      name: 'Ali',
      referralCode: 'KC1',
    });
    useAuthStore.getState().updateUser({ name: 'Veli' });
    expect(useAuthStore.getState().user?.name).toBe('Veli');

    expect(
      filterMenuItems({
        items: [],
        categoryId: null,
        searchQuery: '',
        favoritesOnly: false,
        favoriteIds: [],
      }),
    ).toEqual([]);
  });

  it('handles bootstrapSession, failed refresh, and network errors in api client', async () => {
    expect(resolveApiBaseUrl()).toContain('http');
    expect(await bootstrapSession('http://127.0.0.1:4000')).toBe(false);

    await secureStorage.setRefreshToken('bad-rt');
    let expiredCalled = false;
    sessionTokenStore.onSessionExpired(() => {
      expiredCalled = true;
    });
    global.fetch = jest.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    expect(await bootstrapSession('http://127.0.0.1:4000')).toBe(false);
    expect(expiredCalled).toBe(true);

    const client = createApiClient('http://127.0.0.1:4000');
    global.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(client.GET('/api/v1/banners')).rejects.toBeInstanceOf(ApiClientError);

    expect(normalizeApiError(null, 500).code).toBe('UNKNOWN_ERROR');
    expect(normalizeApiError(null, 401).code).toBe('UNAUTHORIZED');
    expect(normalizeApiError(null, 429).code).toBe('RATE_LIMITED');
    expect(normalizeApiError({ error: {} }, 500).code).toBe('UNKNOWN_ERROR');

    const nestedScrub = scrubSentryEvent({
      extra: { nested: { phone: '+905321112233', safe: 'ok' } },
    });
    expect(nestedScrub.extra).toEqual({ nested: { phone: '[REDACTED]', safe: 'ok' } });
  });
});

