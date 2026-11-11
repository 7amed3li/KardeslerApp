import type { ServerResponse } from 'node:http';

export interface SseEvent {
  id: number;
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export class RealtimeBroker {
  private nextEventId = 1;
  private readonly history: SseEvent[] = [];
  private readonly maxHistory = 200;
  private readonly clients = new Set<ServerResponse>();

  public publish(event: string, data: Record<string, unknown>): SseEvent {
    const evt: SseEvent = {
      id: this.nextEventId++,
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    this.history.push(evt);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const formatted = this.formatSseMessage(evt);
    for (const res of this.clients) {
      if (!res.writableEnded) {
        res.write(formatted);
      } else {
        this.clients.delete(res);
      }
    }

    return evt;
  }

  public getEventsSince(lastEventId: number): SseEvent[] {
    return this.history.filter((e) => e.id > lastEventId);
  }

  public subscribe(res: ServerResponse, lastEventId?: number): () => void {
    if (typeof lastEventId === 'number' && !Number.isNaN(lastEventId)) {
      const missed = this.getEventsSince(lastEventId);
      for (const evt of missed) {
        res.write(this.formatSseMessage(evt));
      }
    }

    this.clients.add(res);
    return () => {
      this.clients.delete(res);
    };
  }

  public formatSseMessage(evt: SseEvent): string {
    return `id: ${evt.id}\nevent: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`;
  }
}

export const realtimeBroker = new RealtimeBroker();

