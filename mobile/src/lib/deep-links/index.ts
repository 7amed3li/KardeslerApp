const UUID_OR_ID_REGEX = /^[A-Za-z0-9_-]{4,64}$/;

export type AllowedDeepLink =
  | { route: '/(tabs)' }
  | { route: '/(tabs)/menu' }
  | { route: '/cart' }
  | { route: '/(tabs)/orders' }
  | { route: '/(tabs)/profile' }
  | { route: '/orders/[id]'; params: { id: string } }
  | { route: '/payment-return'; params: { orderId?: string } };

/**
 * Parses deep links (`kardesler://...`) and push notification `data.url`
 * against a strict route whitelist. Rejects unknown schemes, path traversals,
 * and unvalidated query injections.
 */
export function parseSafeDeepLink(rawUrl: string | null | undefined): AllowedDeepLink | null {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }

  let normalized = rawUrl.trim();
  if (normalized.startsWith('kardesler://')) {
    normalized = normalized.slice('kardesler://'.length);
  } else if (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  } else {
    return null;
  }

  const [pathPart, queryPart] = normalized.split('?');
  if (!pathPart) {
    return { route: '/(tabs)' };
  }

  const segments = pathPart.split('/').filter(Boolean);
  if (segments.some((s) => s === '..' || s === '.')) {
    return null;
  }

  if (segments.length === 1) {
    if (segments[0] === 'menu') return { route: '/(tabs)/menu' };
    if (segments[0] === 'cart') return { route: '/cart' };
    if (segments[0] === 'orders') return { route: '/(tabs)/orders' };
    if (segments[0] === 'profile') return { route: '/(tabs)/profile' };
    if (segments[0] === 'payment-return') {
      const orderId = extractQueryParam(queryPart, 'orderId');
      return {
        route: '/payment-return',
        params: orderId && UUID_OR_ID_REGEX.test(orderId) ? { orderId } : {},
      };
    }
  }

  if (segments.length === 2 && segments[0] === 'orders' && segments[1]) {
    if (UUID_OR_ID_REGEX.test(segments[1])) {
      return { route: '/orders/[id]', params: { id: segments[1] } };
    }
  }

  return null;
}

function extractQueryParam(query: string | undefined, key: string): string | undefined {
  if (!query) return undefined;
  const pairs = query.split('&');
  for (const pair of pairs) {
    const [k, v] = pair.split('=');
    if (k === key && v) {
      return decodeURIComponent(v);
    }
  }
  return undefined;
}

