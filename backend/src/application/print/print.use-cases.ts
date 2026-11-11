import { DomainError } from '../../domain/errors.js';
import { ThermalTicketDomain } from '../../domain/print/thermal-ticket.domain.js';
import type { Clock } from '../../ports/clock.js';
import type { PrintRepository, SettingsRepository } from '../../ports/repositories.js';
import type { EventBusPort, RealtimeEvent } from '../../ports/state.js';

export class PrintAndRealtimeUseCases {
  constructor(
    private readonly printRepo: PrintRepository,
    private readonly settingsRepo: SettingsRepository,
    private readonly eventBus: EventBusPort,
    private readonly clock: Clock,
  ) {}

  async pollPendingJobs(deviceId: string) {
    const jobs = await this.printRepo.recordHeartbeatAndPollPending(deviceId, this.clock.now());
    return {
      jobs: jobs.map((j) => {
        const ticket = ThermalTicketDomain.formatKitchenTicket({
          orderNumber: j.orderNumber,
          businessDate: j.businessDate,
          orderType: j.orderType,
          paymentMethod: j.paymentMethod,
          customerName: j.customerName,
          customerPhone: j.customerPhone,
          addressText: j.addressText,
          customerNote: j.customerNote,
          items: j.items,
          subtotalKurus: j.subtotalKurus,
          discountKurus: j.discountKurus,
          totalKurus: j.totalKurus,
          createdAt: j.createdAt,
        });
        return {
          jobId: j.jobId,
          orderId: j.orderId,
          orderNumber: j.orderNumber,
          kind: j.kind,
          textTr: ticket.textTr,
          escPosBase64: ticket.escPosBase64,
        };
      }),
    };
  }

  async ackPrintJob(jobId: string, status: 'printed' | 'failed', error?: string) {
    const printJob = await this.printRepo.ackPrintJob(jobId, {
      status,
      error,
      now: this.clock.now(),
    });
    if (!printJob) throw new DomainError('NOT_FOUND', 404, 'Yazdırma görevi bulunamadı');
    return { printJob };
  }

  async recordHeartbeat(
    staffId: string,
    role: 'staff' | 'owner',
    input: { deviceId: string; kind: 'print_agent' | 'staff_tablet'; meta?: Record<string, unknown> },
  ) {
    await this.settingsRepo.recordHeartbeat(staffId, role, {
      deviceId: input.deviceId,
      kind: input.kind,
      meta: input.meta ?? {},
      now: this.clock.now(),
    });
    return { recorded: true };
  }

  async getEventSnapshot(lastEventId?: number) {
    const since = lastEventId !== undefined && !Number.isNaN(lastEventId) ? lastEventId : 0;
    return { events: await this.eventBus.getEventsSince(since) };
  }

  async subscribeStaffEvents(listener: (evt: RealtimeEvent) => void, lastEventId?: number) {
    return this.eventBus.subscribe(listener, lastEventId);
  }
}

