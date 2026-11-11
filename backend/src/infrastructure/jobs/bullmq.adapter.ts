import { Queue, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { BackgroundJobsUseCases } from '../../application/jobs/jobs.use-cases.js';
import type { JobQueuePort } from '../../ports/state.js';

export const BACKGROUND_QUEUE_NAME = 'kardesler-background-jobs';

export class BullMqJobAdapter implements JobQueuePort {
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly connection: Redis,
    private readonly jobsUseCases: BackgroundJobsUseCases,
  ) {}

  async enqueue(jobName: string, data: Record<string, unknown> = {}): Promise<void> {
    if (!this.queue) {
      this.queue = new Queue(BACKGROUND_QUEUE_NAME, { connection: this.connection as any });
    }
    await this.queue.add(jobName, data, {
      removeOnComplete: 50,
      removeOnFail: 50,
    });
  }

  async runNamedJob(name: string): Promise<unknown> {
    switch (name) {
      case 'expire-unpaid-orders':
        return this.jobsUseCases.expireUnpaidCardOrders();
      case 'unaccepted-orders-alert':
        return this.jobsUseCases.checkUnacceptedOrdersAlert();
      case 'reconcile-payments':
        return this.jobsUseCases.reconcilePendingPayments();
      case 'cleanup-auth':
        return this.jobsUseCases.cleanupExpiredAuthRecords();
      case 'retry-notifications':
        return this.jobsUseCases.retryFailedNotifications();
      default:
        return null;
    }
  }

  async start(): Promise<void> {
    if (!this.queue) {
      this.queue = new Queue(BACKGROUND_QUEUE_NAME, { connection: this.connection as any });
    }
    if (!this.worker) {
      this.worker = new Worker(
        BACKGROUND_QUEUE_NAME,
        async (job: Job) => this.runNamedJob(job.name),
        { connection: this.connection as any },
      );
    }

    await this.queue.upsertJobScheduler('sched-expire-unpaid', { every: 60_000 }, { name: 'expire-unpaid-orders' });
    await this.queue.upsertJobScheduler('sched-unaccepted-alert', { every: 60_000 }, { name: 'unaccepted-orders-alert' });
    await this.queue.upsertJobScheduler('sched-reconcile', { every: 300_000 }, { name: 'reconcile-payments' });
    await this.queue.upsertJobScheduler('sched-cleanup-auth', { every: 3_600_000 }, { name: 'cleanup-auth' });
    await this.queue.upsertJobScheduler('sched-retry-push', { every: 120_000 }, { name: 'retry-notifications' });
  }

  async stop(): Promise<void> {
    await Promise.allSettled([this.worker?.close(), this.queue?.close()]);
    this.worker = null;
    this.queue = null;
  }
}
