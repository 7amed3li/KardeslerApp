import type { StaffRole } from '@kardesler/shared';

export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<boolean>;
}

export interface PushNotificationInput {
  pushToken: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushProvider {
  send(input: PushNotificationInput): Promise<{ ticketId: string }>;
}

export interface PaymentInitRequest {
  orderId: string;
  amountKurus: number;
  customerName: string;
  customerPhone: string;
  callbackUrl: string;
}

export interface PaymentInitResponse {
  paymentPageUrl?: string;
  token: string;
}

export interface PaymentWebhookInput {
  providerEventId: string;
  orderId: string;
  amountKurus: number;
  status: 'paid' | 'failed';
  providerRef: string;
  signature: string;
  rawBody?: string;
  signatureHeader?: string;
}

export interface PaymentProvider {
  readonly providerName: string;
  initializePayment(req: PaymentInitRequest): Promise<PaymentInitResponse>;
  verifyWebhook(payload: PaymentWebhookInput): boolean;
  refundPayment(providerRef: string, amountKurus: number): Promise<{ refundRef: string }>;
}

export interface CustomerTokenClaims {
  sub: string;
  role: 'customer';
  kid?: string;
}

export interface StaffTokenClaims {
  sub: string;
  role: StaffRole;
  kid?: string;
}

export interface PrintAgentTokenClaims {
  sub: string;
  role: 'print_agent';
  jti: string;
  kid?: string;
}

export interface TokenServicePort {
  signCustomerToken(userId: string): Promise<{ accessToken: string }>;
  verifyCustomerToken(token: string): Promise<CustomerTokenClaims>;
  signStaffToken(staffId: string, role: StaffRole): Promise<{ accessToken: string; refreshToken?: string }>;
  verifyStaffToken(token: string): Promise<StaffTokenClaims>;
  signStaffTotpSetupToken(staffId: string): Promise<string>;
  verifyStaffTotpSetupToken(token: string): Promise<{ sub: string }>;
  signStaffSseTicket(staffId: string, role: StaffRole): Promise<string>;
  verifyStaffSseTicket(ticket: string): Promise<StaffTokenClaims>;
  signPrintAgentToken(deviceId: string, jti: string): Promise<string>;
  verifyPrintAgentToken(token: string): Promise<PrintAgentTokenClaims>;
}

export interface CryptoServicePort {
  hashOtp(code: string, salt: string, phone: string): string;
  verifyOtpHash(expectedHex: string, candidateHex: string): boolean;
  hashRefreshToken(rawToken: string): string;
  hashPassword(plain: string): Promise<string>;
  verifyPassword(hash: string, plain: string): Promise<boolean>;
  encryptTotpSecret(plainSecret: string): string;
  decryptTotpSecret(encryptedPayload: string): string;
  generateTotpSecret(): string;
  verifyTotpCode(plainSecret: string, code: string): boolean;
}

export interface GoogleExchangeInput {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  nonce: string;
}

export interface GoogleVerifiedClaims {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface GoogleOidcProviderPort {
  exchangeCodeAndVerifyIdToken(input: GoogleExchangeInput): Promise<GoogleVerifiedClaims>;
}

