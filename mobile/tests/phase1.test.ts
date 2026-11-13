import { normalizeApiError } from '../src/api/errors';
import { toTurkishLowerCase, toTurkishUpperCase } from '../src/i18n';
import { parseSafeDeepLink } from '../src/lib/deep-links';
import { formatKurus } from '../src/lib/money/format';
import { scrubSentryEvent } from '../src/lib/sentry';

describe('Phase 1 Foundation Utilities', () => {
  it('formats integer kuruş with tr-TR TRY currency formatter', () => {
    const formatted = formatKurus(34000);
    expect(formatted).toContain('340');
    expect(formatted).toContain('₺');
  });

  it('handles Turkish İ/ı casing safely', () => {
    expect(toTurkishUpperCase('cihangir i̇ş')).toBe('CİHANGİR İ̇Ş');
    expect(toTurkishLowerCase('IŞIK İSTANBUL')).toBe('ışık istanbul');
  });

  it('parses only whitelisted deep links and rejects unsafe paths', () => {
    expect(parseSafeDeepLink('kardesler://orders/ord-1234')).toEqual({
      route: '/orders/[id]',
      params: { id: 'ord-1234' },
    });
    expect(parseSafeDeepLink('kardesler://payment-return?orderId=ord-9999')).toEqual({
      route: '/payment-return',
      params: { orderId: 'ord-9999' },
    });
    expect(parseSafeDeepLink('kardesler://../admin/secret')).toBeNull();
    expect(parseSafeDeepLink('https://evil.com/orders/123')).toBeNull();
  });

  it('scrubs PII and auth headers from Sentry events', () => {
    const scrubbed = scrubSentryEvent({
      user: { id: 'u-1', phone: '+905551112233', email: 'a@b.com' },
      request: { headers: { Authorization: 'Bearer secret', 'x-request-id': 'r1' } },
      extra: { refreshToken: 'rt-123', orderId: 'ord-1' },
    });
    expect(scrubbed.user).toEqual({ id: 'u-1' });
    expect(scrubbed.request?.headers?.Authorization).toBeUndefined();
    expect(scrubbed.request?.headers?.['x-request-id']).toBe('r1');
    expect(scrubbed.extra).toEqual({ refreshToken: '[REDACTED]', orderId: 'ord-1' });
  });

  it('normalizes backend error payloads into ApiClientError', () => {
    const err = normalizeApiError(
      { error: { code: 'RATE_LIMITED', message: 'Çok fazla deneme', requestId: 'req-9' } },
      429,
    );
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.status).toBe(429);
    expect(err.requestId).toBe('req-9');
    expect(err.message).toBe('Çok fazla deneme');
  });
});

