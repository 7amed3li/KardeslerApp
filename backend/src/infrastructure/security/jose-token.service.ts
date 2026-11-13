import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { StaffRole } from '@kardesler/shared';
import { DomainError } from '../../domain/errors.js';
import type {
  CustomerTokenClaims,
  PrintAgentTokenClaims,
  StaffTokenClaims,
  TokenServicePort,
} from '../../ports/providers.js';

export interface JwtKeyring {
  activeKid: string;
  previousKid?: string;
  customerSecret: string;
  customerPrevSecret?: string;
  staffSecret: string;
  staffPrevSecret?: string;
  printSecret: string;
  printPrevSecret?: string;
}

const ISSUER = 'kardesler-cihangir-api';
const ALG = 'HS256';
const enc = new TextEncoder();

export class JoseTokenService implements TokenServicePort {
  constructor(private readonly keyring: JwtKeyring) {}

  private resolveKey(
    headerKid: string | undefined,
    activeSecret: string,
    prevSecret: string | undefined,
  ): Uint8Array {
    if (!headerKid || headerKid === this.keyring.activeKid) {
      return enc.encode(activeSecret);
    }
    if (this.keyring.previousKid && headerKid === this.keyring.previousKid && prevSecret) {
      return enc.encode(prevSecret);
    }
    throw new DomainError('UNAUTHORIZED', 401, 'Bilinmeyen imza anahtarı (kid)');
  }

  private async sign(
    claims: JWTPayload,
    subject: string,
    audience: string,
    expiresIn: string,
    secret: string,
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: ALG, kid: this.keyring.activeKid, typ: 'JWT' })
      .setSubject(subject)
      .setIssuer(ISSUER)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(enc.encode(secret));
  }

  private async verify(
    token: string,
    audience: string,
    activeSecret: string,
    prevSecret: string | undefined,
  ): Promise<{ payload: JWTPayload; kid?: string }> {
    const { payload, protectedHeader } = await jwtVerify(
      token,
      (header) => {
        if (header.alg !== ALG) {
          throw new DomainError('UNAUTHORIZED', 401, 'İzin verilmeyen JWT algoritması');
        }
        return this.resolveKey(header.kid, activeSecret, prevSecret);
      },
      { algorithms: [ALG], issuer: ISSUER, audience },
    );
    return { payload, kid: protectedHeader.kid };
  }

  async signCustomerToken(userId: string): Promise<{ accessToken: string }> {
    const accessToken = await this.sign(
      { role: 'customer' },
      userId,
      'kardesler-mobile',
      '15m',
      this.keyring.customerSecret,
    );
    return { accessToken };
  }

  async verifyCustomerToken(token: string): Promise<CustomerTokenClaims> {
    try {
      const { payload, kid } = await this.verify(
        token,
        'kardesler-mobile',
        this.keyring.customerSecret,
        this.keyring.customerPrevSecret,
      );
      if (payload.role !== 'customer' || typeof payload.sub !== 'string') {
        throw new Error('Invalid customer claims');
      }
      return { sub: payload.sub, role: 'customer', kid };
    } catch {
      throw new DomainError('UNAUTHORIZED', 401, 'Geçersiz veya süresi dolmuş müşteri oturumu');
    }
  }

  async signStaffToken(staffId: string, role: StaffRole): Promise<{ accessToken: string }> {
    const accessToken = await this.sign(
      { role },
      staffId,
      'kardesler-admin',
      '8h',
      this.keyring.staffSecret,
    );
    return { accessToken };
  }

  async verifyStaffToken(token: string): Promise<StaffTokenClaims> {
    try {
      const { payload, kid } = await this.verify(
        token,
        'kardesler-admin',
        this.keyring.staffSecret,
        this.keyring.staffPrevSecret,
      );
      if ((payload.role !== 'owner' && payload.role !== 'staff') || typeof payload.sub !== 'string') {
        throw new Error('Invalid staff claims');
      }
      return { sub: payload.sub, role: payload.role, kid };
    } catch {
      throw new DomainError('UNAUTHORIZED', 401, 'Geçersiz veya süresi dolmuş personel oturumu');
    }
  }

  async signStaffTotpSetupToken(staffId: string): Promise<string> {
    return this.sign(
      { purpose: 'totp_setup' },
      staffId,
      'kardesler-admin-setup',
      '10m',
      this.keyring.staffSecret,
    );
  }

  async signStaffSseTicket(staffId: string, role: StaffRole): Promise<string> {
    return this.sign(
      { role, purpose: 'sse_ticket' },
      staffId,
      'kardesler-admin-sse',
      '60s',
      this.keyring.staffSecret,
    );
  }

  async verifyStaffSseTicket(ticket: string): Promise<StaffTokenClaims> {
    try {
      const { payload, kid } = await this.verify(
        ticket,
        'kardesler-admin-sse',
        this.keyring.staffSecret,
        this.keyring.staffPrevSecret,
      );
      if ((payload.role !== 'owner' && payload.role !== 'staff') || typeof payload.sub !== 'string') {
        throw new Error('Invalid staff ticket claims');
      }
      return { sub: payload.sub, role: payload.role, kid };
    } catch {
      throw new DomainError('UNAUTHORIZED', 401, 'Geçersiz veya süresi dolmuş SSE bileti (ticket)');
    }
  }

  async verifyStaffTotpSetupToken(token: string): Promise<{ sub: string }> {
    try {
      const { payload } = await this.verify(
        token,
        'kardesler-admin-setup',
        this.keyring.staffSecret,
        this.keyring.staffPrevSecret,
      );
      if (payload.purpose !== 'totp_setup' || typeof payload.sub !== 'string') {
        throw new Error('Invalid setup claims');
      }
      return { sub: payload.sub };
    } catch {
      throw new DomainError('UNAUTHORIZED', 401, 'Geçersiz TOTP kurulum anahtarı');
    }
  }

  async signPrintAgentToken(deviceId: string, jti: string): Promise<string> {
    return this.sign(
      { role: 'print_agent', jti },
      deviceId,
      'kardesler-printer',
      '30d',
      this.keyring.printSecret,
    );
  }

  async verifyPrintAgentToken(token: string): Promise<PrintAgentTokenClaims> {
    try {
      const { payload, kid } = await this.verify(
        token,
        'kardesler-printer',
        this.keyring.printSecret,
        this.keyring.printPrevSecret,
      );
      if (
        payload.role !== 'print_agent' ||
        typeof payload.sub !== 'string' ||
        typeof payload.jti !== 'string'
      ) {
        throw new Error('Invalid print agent claims');
      }
      return { sub: payload.sub, role: 'print_agent', jti: payload.jti, kid };
    } catch {
      throw new DomainError('UNAUTHORIZED', 401, 'Geçersiz veya iptal edilmiş yazıcı ajan anahtarı');
    }
  }
}

