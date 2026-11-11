import type { Redis } from 'ioredis';
import type {
  CachePort,
  IdempotencyRecord,
  IdempotencyStorePort,
  RevokedTokenStorePort,
} from '../../ports/state.js';

export class RedisCacheAdapter implements CachePort {
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(`cache:${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await this.redis.set(`cache:${key}`, JSON.stringify(value), 'PX', Math.max(1000, ttlMs));
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `kardesler:cache:${prefix}*`,
        'COUNT',
        200,
      );
      cursor = next;
      if (keys.length > 0) {
        const unprefixed = keys.map((k) => k.replace(/^kardesler:/, ''));
        await this.redis.del(...unprefixed);
      }
    } while (cursor !== '0');
  }
}

export class RedisRevokedTokenStore implements RevokedTokenStorePort {
  constructor(private readonly redis: Redis) {}

  async revoke(jti: string, ttlSeconds = 30 * 24 * 3600): Promise<void> {
    await this.redis.set(`revoked_jti:${jti}`, '1', 'EX', ttlSeconds);
  }

  async isRevoked(jti: string): Promise<boolean> {
    const val = await this.redis.get(`revoked_jti:${jti}`);
    return val === '1';
  }
}

export class RedisIdempotencyStore implements IdempotencyStorePort {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<IdempotencyRecord | null> {
    const raw = await this.redis.get(`idem:${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as IdempotencyRecord;
  }

  async set(key: string, record: IdempotencyRecord, ttlSeconds = 86400): Promise<void> {
    await this.redis.set(`idem:${key}`, JSON.stringify(record), 'EX', ttlSeconds);
  }
}
