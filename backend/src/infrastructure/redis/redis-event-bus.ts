import type { Redis } from 'ioredis';
import { DomainError } from '../../domain/errors.js';
import type { EventBusPort, RealtimeEvent } from '../../ports/state.js';

export class RedisEventBus implements EventBusPort {
  private readonly channel = 'events:staff';
  private readonly historyKey = 'events:staff:history';
  private readonly seqKey = 'events:staff:seq';
  private readonly maxHistory = 200;
  private readonly listeners = new Set<(evt: RealtimeEvent) => void>();
  private subscribed = false;
  private listenerAttached = false;

  constructor(
    private readonly pubRedis: Redis,
    private readonly subRedis: Redis,
  ) {}

  private attachHooks(): void {
    if (this.listenerAttached) return;
    this.listenerAttached = true;
    this.subRedis.on('message', (_chan, msg) => {
      try {
        const evt = JSON.parse(msg) as RealtimeEvent;
        for (const fn of this.listeners) fn(evt);
      } catch {
        // ignore malformed event payload
      }
    });
    this.subRedis.on('close', () => {
      this.subscribed = false;
    });
    this.subRedis.on('ready', () => {
      if (this.listeners.size > 0 && !this.subscribed) {
        void this.subRedis.subscribe(this.channel).then(() => {
          this.subscribed = true;
        }).catch(() => {});
      }
    });
  }

  private async ensureSubscribed(): Promise<void> {
    this.attachHooks();
    if (this.subRedis.status !== 'ready') {
      throw new DomainError('SERVICE_UNAVAILABLE', 503, 'Gerçek zamanlı yayın bağlantısı geçici olarak kapalı');
    }
    if (this.subscribed) return;
    await this.subRedis.subscribe(this.channel);
    this.subscribed = true;
  }

  async publish(event: string, data: Record<string, unknown>): Promise<RealtimeEvent> {
    const id = await this.pubRedis.incr(this.seqKey);
    const evt: RealtimeEvent = {
      id,
      event,
      data,
      timestamp: new Date().toISOString(),
    };
    const serialized = JSON.stringify(evt);
    await this.pubRedis.rpush(this.historyKey, serialized);
    await this.pubRedis.ltrim(this.historyKey, -this.maxHistory, -1);
    await this.pubRedis.publish(this.channel, serialized);
    return evt;
  }

  async getEventsSince(lastEventId: number): Promise<RealtimeEvent[]> {
    const rawList = await this.pubRedis.lrange(this.historyKey, 0, -1);
    const events: RealtimeEvent[] = [];
    for (const raw of rawList) {
      const evt = JSON.parse(raw) as RealtimeEvent;
      if (evt.id > lastEventId) events.push(evt);
    }
    return events;
  }

  async subscribe(
    listener: (evt: RealtimeEvent) => void,
    lastEventId?: number,
  ): Promise<() => void> {
    await this.ensureSubscribed();
    if (typeof lastEventId === 'number' && !Number.isNaN(lastEventId)) {
      const missed = await this.getEventsSince(lastEventId);
      for (const evt of missed) listener(evt);
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
