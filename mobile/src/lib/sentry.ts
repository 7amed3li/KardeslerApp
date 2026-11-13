import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const SCRUB_KEYS = ['token', 'authorization', 'phone', 'email', 'password', 'code', 'address'];

function scrubObject(input: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const lower = key.toLowerCase();
    if (SCRUB_KEYS.some((k) => lower.includes(k))) {
      copy[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      copy[key] = scrubObject(value as Record<string, unknown>);
    } else {
      copy[key] = value;
    }
  }
  return copy;
}

export function scrubSentryEvent<T extends { request?: { headers?: Record<string, string>; data?: unknown }; extra?: Record<string, unknown>; user?: Record<string, unknown> }>(
  event: T,
): T {
  if (event.user) {
    event.user = { id: event.user.id };
  }
  if (event.request?.headers) {
    delete event.request.headers.Authorization;
    delete event.request.headers.authorization;
    delete event.request.headers.Cookie;
  }
  if (event.extra) {
    event.extra = scrubObject(event.extra);
  }
  return event;
}

export function initSentry(): void {
  const dsn = (Constants.expoConfig?.extra as { sentryDsn?: string } | undefined)?.sentryDsn;
  if (!dsn) return;

  Sentry.init({
    dsn,
    enableAutoSessionTracking: true,
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
  });
}

