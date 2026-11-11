import type { Redis } from 'ioredis';
import { DomainError } from '../../domain/errors.js';
import type { RateLimiterPort } from '../../ports/state.js';

const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local cutoff = now - tonumber(ARGV[2])
local maxReq = tonumber(ARGV[3])
local member = ARGV[4]
local ttlMs = tonumber(ARGV[2])

redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
local count = redis.call('ZCARD', key)
if count >= maxReq then
  return 0
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, ttlMs)
return 1
`;

export class RedisRateLimiter implements RateLimiterPort {
  private readonly breakerKey = 'rl:sms_circuit_tripped_until';

  constructor(private readonly redis: Redis) {}

  async check(key: string, maxRequests: number, windowMs: number, message?: string): Promise<void> {
    const now = Date.now();
    const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;
    const allowed = await this.redis.eval(
      SLIDING_WINDOW_LUA,
      1,
      `rl:${key}`,
      String(now),
      String(windowMs),
      String(maxRequests),
      member,
    );

    if (Number(allowed) !== 1) {
      throw new DomainError(
        'RATE_LIMITED',
        429,
        message ?? 'Çok fazla istek gönderildi, lütfen biraz bekleyin',
      );
    }
  }

  async checkSmsCircuitBreaker(maxGlobalPer5Min = 50): Promise<void> {
    const tripped = await this.redis.get(this.breakerKey);
    if (tripped && Number(tripped) > Date.now()) {
      throw new DomainError(
        'RATE_LIMITED',
        429,
        'SMS güvenlik devre kesicisi aktif, lütfen daha sonra tekrar deneyin',
      );
    }

    try {
      await this.check('global:sms_pumping', maxGlobalPer5Min, 5 * 60 * 1000);
    } catch (err) {
      await this.redis.set(this.breakerKey, String(Date.now() + 10 * 60 * 1000), 'PX', 10 * 60 * 1000);
      throw err;
    }
  }

  async resetAll(): Promise<void> {
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', 'kardesler:rl:*', 'COUNT', 200);
      cursor = next;
      if (keys.length > 0) {
        const unprefixed = keys.map((k) => k.replace(/^kardesler:/, ''));
        await this.redis.del(...unprefixed);
      }
    } while (cursor !== '0');
  }
}
