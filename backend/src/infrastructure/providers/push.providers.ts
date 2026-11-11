import type { PushNotificationInput, PushProvider } from '../../ports/providers.js';

export class FakePushProvider implements PushProvider {
  public readonly sent: PushNotificationInput[] = [];

  async send(input: PushNotificationInput): Promise<{ ticketId: string }> {
    this.sent.push(input);
    return { ticketId: `push_ticket_${Date.now()}` };
  }
}

