import { Redis } from 'ioredis';

export function createRedisConnection(
  redisUrl: string,
  keyPrefix = 'kardesler:',
  failFastWhenOffline = false,
): Redis {
  const client = new Redis(redisUrl, {
    keyPrefix,
    maxRetriesPerRequest: failFastWhenOffline ? 0 : null,
    enableOfflineQueue: true,
    commandTimeout: failFastWhenOffline ? 1500 : undefined,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

  // Prevent unhandled 'error' events from crashing Node when Redis stops transiently
  client.on('error', () => {
    // Handled via fail-closed checks at call sites and /readyz
  });

  return client;
}
