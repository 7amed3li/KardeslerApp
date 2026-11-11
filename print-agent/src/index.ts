import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EscPosTicketFormatter, type TicketData } from './escpos.js';

export interface PolledPrintJob {
  jobId: string;
  orderId: string;
  orderNumber: number;
  orderType: 'delivery' | 'pickup';
  paymentMethod: 'card_online' | 'cash_on_delivery';
  customerName: string;
  customerPhone: string;
  addressText?: string | null;
  customerNote?: string | null;
  items: {
    quantity: number;
    nameTr: string;
    options: { nameTr: string }[];
  }[];
  totalKurus: number;
  createdAt: string;
}

export function toTicketData(job: PolledPrintJob): TicketData {
  return {
    orderNumber: job.orderNumber,
    time: new Date(job.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    orderType: job.orderType,
    items: job.items.map((item) => ({
      name: item.nameTr,
      quantity: item.quantity,
      options: item.options.map((o) => o.nameTr),
    })),
    customerNote: job.customerNote ?? undefined,
    customerName: job.customerName,
    customerPhone: job.customerPhone,
    address: job.addressText ?? undefined,
    paymentMethod: job.paymentMethod,
    totalKurus: job.totalKurus,
  };
}

export interface PrintAgentWorkerOptions {
  backendUrl: string;
  agentToken: string;
  printTicket?: (data: TicketData) => Promise<boolean>;
  fetchFn?: typeof fetch;
  maxDedupeCacheSize?: number;
}

export interface PollCycleStats {
  fetched: number;
  printed: number;
  failed: number;
  skippedDuplicates: number;
}

export async function printKitchenTicket(
  data: TicketData,
  host = process.env.PRINTER_IP || '192.168.1.200',
  port = parseInt(process.env.PRINTER_PORT || '9100', 10),
): Promise<boolean> {
  const payload = EscPosTicketFormatter.buildTicket(data);

  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.connect(port, host, () => {
      socket.write(payload, () => {
        socket.end();
        resolve(true);
      });
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export class PrintAgentWorker {
  private readonly printedJobIds = new Set<string>();
  private readonly maxDedupeSize: number;
  private readonly fetchImpl: typeof fetch;
  private readonly printerImpl: (data: TicketData) => Promise<boolean>;

  constructor(private readonly opts: PrintAgentWorkerOptions) {
    this.maxDedupeSize = opts.maxDedupeCacheSize ?? 5000;
    this.fetchImpl = opts.fetchFn ?? fetch;
    this.printerImpl = opts.printTicket ?? ((data) => printKitchenTicket(data));
  }

  private rememberPrinted(jobId: string): void {
    if (this.printedJobIds.size >= this.maxDedupeSize) {
      const oldest = this.printedJobIds.values().next().value;
      if (oldest) this.printedJobIds.delete(oldest);
    }
    this.printedJobIds.add(jobId);
  }

  private async sendAck(jobId: string, status: 'printed' | 'failed', error?: string): Promise<void> {
    const url = `${this.opts.backendUrl.replace(/\/$/, '')}/api/v1/print-agent/jobs/${jobId}/ack`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.opts.agentToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(error ? { status, error } : { status }),
    });
    if (!res.ok) {
      throw new Error(`Ack failed with HTTP ${res.status} for job ${jobId}`);
    }
  }

  async pollAndProcessOnce(): Promise<PollCycleStats> {
    const url = `${this.opts.backendUrl.replace(/\/$/, '')}/api/v1/print-agent/jobs/poll`;
    const res = await this.fetchImpl(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${this.opts.agentToken}` },
    });
    if (!res.ok) {
      throw new Error(`Poll failed with HTTP ${res.status}`);
    }

    const body = (await res.json()) as { jobs?: PolledPrintJob[] };
    const jobs = body.jobs ?? [];
    const stats: PollCycleStats = { fetched: jobs.length, printed: 0, failed: 0, skippedDuplicates: 0 };

    for (const job of jobs) {
      if (this.printedJobIds.has(job.jobId)) {
        stats.skippedDuplicates++;
        await this.sendAck(job.jobId, 'printed');
        continue;
      }

      const ok = await this.printerImpl(toTicketData(job));
      if (ok) {
        this.rememberPrinted(job.jobId);
        await this.sendAck(job.jobId, 'printed');
        stats.printed++;
      } else {
        await this.sendAck(job.jobId, 'failed', 'SUNLUX RP8020 printer connection failed or timed out');
        stats.failed++;
      }
    }

    return stats;
  }
}

export function startPrintAgentDaemon(): NodeJS.Timeout {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
  const agentToken = process.env.PRINT_AGENT_TOKEN || '';
  if (!agentToken) {
    throw new Error('PRINT_AGENT_TOKEN is required to run print-agent daemon');
  }

  const worker = new PrintAgentWorker({ backendUrl, agentToken });
  const intervalMs = parseInt(process.env.POLL_INTERVAL_MS || '3000', 10);

  void worker.pollAndProcessOnce().catch((err) => {
    console.error('Initial print poll failed:', err instanceof Error ? err.message : err);
  });

  return setInterval(() => {
    void worker.pollAndProcessOnce().catch((err) => {
      console.error('Print poll failed:', err instanceof Error ? err.message : err);
    });
  }, intervalMs);
}

const isDirectEntry =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectEntry) {
  console.log('Kardeşler Cihangir Kitchen Print Agent Service starting...');
  startPrintAgentDaemon();
}
