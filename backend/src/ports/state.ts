export interface RateLimiterPort {
  check(key: string, maxRequests: number, windowMs: number, message?: string): Promise<void>;
  checkSmsCircuitBreaker(maxGlobalPer5Min?: number): Promise<void>;
  resetAll(): Promise<void>;
}

export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  deleteByPrefix(prefix: string): Promise<void>;
}

export interface RealtimeEvent {
  id: number;
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface EventBusPort {
  publish(event: string, data: Record<string, unknown>): Promise<RealtimeEvent>;
  getEventsSince(lastEventId: number): Promise<RealtimeEvent[]>;
  subscribe(listener: (evt: RealtimeEvent) => void, lastEventId?: number): Promise<() => void>;
}

export interface RevokedTokenStorePort {
  revoke(jti: string, ttlSeconds?: number): Promise<void>;
  isRevoked(jti: string): Promise<boolean>;
}

export interface IdempotencyRecord {
  statusCode: number;
  body: unknown;
}

export interface IdempotencyStorePort {
  get(key: string): Promise<IdempotencyRecord | null>;
  set(key: string, record: IdempotencyRecord, ttlSeconds: number): Promise<void>;
}

export interface JobQueuePort {
  enqueue(jobName: string, data?: Record<string, unknown>): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
