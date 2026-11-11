import { describe, it, expect, vi } from 'vitest';
import { PrintAgentWorker, type PolledPrintJob } from '../src/index.js';

function makeJob(overrides: Partial<PolledPrintJob> = {}): PolledPrintJob {
  return {
    jobId: 'job-001',
    orderId: 'ord-001',
    orderNumber: 1042,
    orderType: 'delivery',
    paymentMethod: 'cash_on_delivery',
    customerName: 'Ayşe Kaya',
    customerPhone: '+905331112233',
    addressText: 'Cihangir Cd. No:12',
    customerNote: 'Acısız',
    items: [
      {
        quantity: 1,
        nameTr: 'Adana Kebap',
        options: [{ nameTr: 'Acısız' }],
      },
    ],
    totalKurus: 34000,
    createdAt: '2026-11-11T12:00:00Z',
    ...overrides,
  };
}

describe('PrintAgentWorker polling, deduplication, and acknowledgment', () => {
  it('polls pending jobs, prints once, deduplicates repeats, and sends /ack printed or failed', async () => {
    const job1 = makeJob({ jobId: 'job-1' });
    const job2 = makeJob({ jobId: 'job-2', orderNumber: 1043 });
    const ackCalls: { url: string; body: any }[] = [];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/jobs/poll')) {
        return new Response(JSON.stringify({ jobs: [job1, job2] }), { status: 200 });
      }
      ackCalls.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ updated: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const printTicket = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const worker = new PrintAgentWorker({
      backendUrl: 'http://localhost:4000',
      agentToken: 'test-agent-jwt',
      fetchFn: fetchMock,
      printTicket,
    });

    const first = await worker.pollAndProcessOnce();
    expect(first).toEqual({ fetched: 2, printed: 1, failed: 1, skippedDuplicates: 0 });
    expect(printTicket).toHaveBeenCalledTimes(2);
    expect(ackCalls[0]).toEqual({
      url: 'http://localhost:4000/api/v1/print-agent/jobs/job-1/ack',
      body: { status: 'printed' },
    });
    expect(ackCalls[1]).toEqual({
      url: 'http://localhost:4000/api/v1/print-agent/jobs/job-2/ack',
      body: { status: 'failed', error: 'SUNLUX RP8020 printer connection failed or timed out' },
    });

    // Second poll returning job-1 again must NOT reprint it (dedupe!), only re-ack printed
    const second = await worker.pollAndProcessOnce();
    expect(second).toEqual({ fetched: 1 + 1, printed: 0, failed: 1, skippedDuplicates: 1 });
    expect(printTicket).toHaveBeenCalledTimes(3); // only job-2 retried, job-1 skipped
  });
});
