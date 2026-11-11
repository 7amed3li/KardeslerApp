import { DomainError } from '../../domain/errors.js';
import type {
  CachePort,
  EventBusPort,
  IdempotencyRecord,
  IdempotencyStorePort,
  RateLimiterPort,
  RealtimeEvent,
  RevokedTokenStorePort,
} from '../../ports/state.js';

export class InMemoryRateLimiter implements RateLimiterPort {
  private readonly store = new Map<string, number[]>();
  private circuitTrippedUntil = 0;

  async resetAll(): Promise<void> {
    this.store.clear();
    this.circuitTrippedUntil = 0;
  }

  async check(key: string, maxRequests: number, windowMs: number, message?: string): Promise<void> {
    const now = Date.now();
    const entries = (this.store.get(key) ?? []).filter((t) => t > now - windowMs);
    if (entries.length >= maxRequests) {
      throw new DomainError('RATE_LIMITED', 429, message ?? 'Çok fazla istek gönderildi');
    }
    entries.push(now);
    this.store.set(key, entries);
  }

  async checkSmsCircuitBreaker(maxGlobalPer5Min = 50): Promise<void> {
    const now = Date.now();
    if (now < this.circuitTrippedUntil) {
      throw new DomainError('RATE_LIMITED', 429, 'SMS güvenlik devre kesicisi aktif');
    }
    try {
      await this.check('global:sms_pumping', maxGlobalPer5Min, 5 * 60 * 1000);
    } catch (err) {
      this.circuitTrippedUntil = now + 10 * 60 * 1000;
      throw err;
    }
  }
}

export class InMemoryCacheAdapter implements CachePort {
  private readonly map = new Map<string, { expiresAt: number; data: unknown }>();

  async get<T>(key: string): Promise<T | null> {
    const hit = this.map.get(key);
    if (!hit || hit.expiresAt <= Date.now()) return null;
    return hit.data as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.map.set(key, { expiresAt: Date.now() + ttlMs, data: value });
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    for (const k of this.map.keys()) {
      if (k.startsWith(prefix)) this.map.delete(k);
    }
  }
}

export class InMemoryEventBus implements EventBusPort {
  private seq = 1;
  private readonly history: RealtimeEvent[] = [];
  private readonly listeners = new Set<(evt: RealtimeEvent) => void>();

  async publish(event: string, data: Record<string, unknown>): Promise<RealtimeEvent> {
    const evt: RealtimeEvent = { id: this.seq++, event, data, timestamp: new Date().toISOString() };
    this.history.push(evt);
    if (this.history.length > 200) this.history.shift();
    for (const fn of this.listeners) fn(evt);
    return evt;
  }

  async getEventsSince(lastEventId: number): Promise<RealtimeEvent[]> {
    return this.history.filter((e) => e.id > lastEventId);
  }

  async subscribe(listener: (evt: RealtimeEvent) => void, lastEventId?: number): Promise<() => void> {
    if (typeof lastEventId === 'number' && !Number.isNaN(lastEventId)) {
      for (const evt of await this.getEventsSince(lastEventId)) listener(evt);
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export class InMemoryRevokedTokenStore implements RevokedTokenStorePort {
  private readonly set = new Set<string>();
  async revoke(jti: string): Promise<void> {
    this.set.add(jti);
  }
  async isRevoked(jti: string): Promise<boolean> {
    return this.set.has(jti);
  }
}

export class InMemoryIdempotencyStore implements IdempotencyStorePort {
  private readonly map = new Map<string, IdempotencyRecord>();
  async get(key: string): Promise<IdempotencyRecord | null> {
    return this.map.get(key) ?? null;
  }
  async set(key: string, record: IdempotencyRecord): Promise<void> {
    this.map.set(key, record);
  }
}
