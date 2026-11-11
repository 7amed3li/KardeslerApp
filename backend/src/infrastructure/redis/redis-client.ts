import { Redis } from 'ioredis';

export function createRedisConnection(redisUrl: string, keyPrefix = 'kardesler:'): Redis {
  return new Redis(redisUrl, {
    keyPrefix,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}
