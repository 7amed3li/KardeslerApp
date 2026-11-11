import type { SmsProvider } from '../../ports/providers.js';

export class ConsoleSmsProvider implements SmsProvider {
  public readonly lastSentCodeByPhone = new Map<string, string>();

  async sendOtp(phone: string, code: string): Promise<boolean> {
    this.lastSentCodeByPhone.set(phone, code);
    return true;
  }
}

export class NetgsmSmsProvider implements SmsProvider {
  constructor(
    private readonly userCode: string,
    private readonly userPass: string,
    private readonly msgHeader: string,
  ) {}

  async sendOtp(_phone: string, _code: string): Promise<boolean> {
    void this.userCode;
    void this.userPass;
    void this.msgHeader;
    return true;
  }
}
