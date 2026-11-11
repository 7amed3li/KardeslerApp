import type { FastifyRequest } from 'fastify';
import type { LanguageCode, StaffRole } from '@kardesler/shared';
import { DomainError } from '../domain/errors.js';
import type { TokenServicePort } from '../ports/providers.js';
import type { RevokedTokenStorePort } from '../ports/state.js';

export class HttpAuthHooks {
  constructor(
    private readonly tokens: TokenServicePort,
    private readonly revokedTokens: RevokedTokenStorePort,
  ) {}

  private extractBearer(request: FastifyRequest): string {
    const h = request.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) {
      throw new DomainError('UNAUTHORIZED', 401, 'Yetkilendirme başlığı (Bearer token) eksik');
    }
    const token = h.slice(7).trim();
    if (!token) throw new DomainError('UNAUTHORIZED', 401, 'Geçersiz yetkilendirme anahtarı');
    return token;
  }

  async requireCustomer(request: FastifyRequest) {
    return this.tokens.verifyCustomerToken(this.extractBearer(request));
  }

  async requireStaff(request: FastifyRequest, allowedRoles: readonly StaffRole[] = ['staff', 'owner']) {
    const payload = await this.tokens.verifyStaffToken(this.extractBearer(request));
    if (!allowedRoles.includes(payload.role)) {
      throw new DomainError('FORBIDDEN', 403, 'Bu işlem için yetki seviyeniz yetersiz (Sadece Owner)');
    }
    return payload;
  }

  async requirePrintAgent(request: FastifyRequest) {
    const payload = await this.tokens.verifyPrintAgentToken(this.extractBearer(request));
    if (await this.revokedTokens.isRevoked(payload.jti)) {
      throw new DomainError('UNAUTHORIZED', 401, 'Yazıcı ajan anahtarı iptal edilmiş');
    }
    return payload;
  }

  resolveLanguage(request: FastifyRequest): LanguageCode {
    const q = (request.query as Record<string, string | undefined>)?.lang;
    if (q === 'tr' || q === 'en' || q === 'ar') return q;
    const h = request.headers['accept-language'];
    if (typeof h === 'string') {
      const lower = h.toLowerCase();
      if (lower.startsWith('ar') || lower.includes('ar-') || lower.includes('ar,')) return 'ar';
      if (lower.startsWith('en') || lower.includes('en-') || lower.includes('en,')) return 'en';
    }
    return 'tr';
  }
}

