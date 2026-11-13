const SENSITIVE_KEYS = new Set([
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'password',
  'code',
  'phone',
  'email',
  'pushToken',
]);

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEYS.has(key)) {
    return '[REDACTED]';
  }
  if (typeof value === 'string' && value.startsWith('Bearer ')) {
    return 'Bearer [REDACTED]';
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(k, v);
    }
    return out;
  }
  return value;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    if (__DEV__) {
      console.info(`[KC] ${message}`, meta ? redactValue('meta', meta) : '');
    }
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[KC] ${message}`, meta ? redactValue('meta', meta) : '');
  },
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(`[KC] ${message}`, meta ? redactValue('meta', meta) : '');
  },
};

