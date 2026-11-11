import type { FastifyRequest } from 'fastify';
import { AppError } from './errors.js';
import {
  AuthService,
  type CustomerJwtPayload,
  type StaffJwtPayload,
  type PrintAgentJwtPayload,
} from '../modules/auth/auth.service.js';
import { type StaffRole, type LanguageCode } from '@kardesler/shared';

interface WindowEntry {
  timestamps: number[];
}

export class RateLimiter {
  private readonly store = new Map<string, WindowEntry>();
  private smsCircuitTrippedUntil = 0;

  public resetAll(): void {
    this.store.clear();
    this.smsCircuitTrippedUntil = 0;
  }

  public check(key: string, maxRequests: number, windowMs: number, message?: string): void {
    const now = Date.now();
    const cutoff = now - windowMs;
    const entry = this.store.get(key) ?? { timestamps: [] };
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= maxRequests) {
      throw new AppError(
        'RATE_LIMITED',
        429,
        message ?? 'Çok fazla istek gönderildi, lütfen biraz bekleyin',
      );
    }

    entry.timestamps.push(now);
    this.store.set(key, entry);
  }

  public checkSmsCircuitBreaker(maxGlobalPer5Min = 50): void {
    const now = Date.now();
    if (now < this.smsCircuitTrippedUntil) {
      throw new AppError(
        'RATE_LIMITED',
        429,
        'SMS güvenlik devre kesicisi aktif, lütfen daha sonra tekrar deneyin',
      );
    }

    try {
      this.check('global:sms_pumping', maxGlobalPer5Min, 5 * 60 * 1000);
    } catch (err) {
      this.smsCircuitTrippedUntil = now + 10 * 60 * 1000;
      throw err;
    }
  }
}

export const rateLimiter = new RateLimiter();

function extractBearerToken(request: FastifyRequest): string {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 401, 'Yetkilendirme başlığı (Bearer token) eksik');
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    throw new AppError('UNAUTHORIZED', 401, 'Geçersiz yetkilendirme anahtarı');
  }
  return token;
}

export function requireCustomer(request: FastifyRequest): CustomerJwtPayload {
  const token = extractBearerToken(request);
  return AuthService.verifyCustomerToken(token);
}

export function requireStaff(
  request: FastifyRequest,
  allowedRoles: StaffRole[] = ['staff', 'owner'],
): StaffJwtPayload {
  const token = extractBearerToken(request);
  const payload = AuthService.verifyStaffToken(token);
  if (!allowedRoles.includes(payload.role)) {
    throw new AppError('FORBIDDEN', 403, 'Bu işlem için yetki seviyeniz yetersiz (Sadece Owner)');
  }
  return payload;
}

export function requirePrintAgent(request: FastifyRequest): PrintAgentJwtPayload {
  const token = extractBearerToken(request);
  return AuthService.verifyPrintAgentToken(token);
}

export function resolveLanguage(request: FastifyRequest): LanguageCode {
  const queryLang = (request.query as Record<string, string | undefined>)?.lang;
  if (queryLang === 'tr' || queryLang === 'en' || queryLang === 'ar') {
    return queryLang;
  }
  const header = request.headers['accept-language'];
  if (typeof header === 'string') {
    const lower = header.toLowerCase();
    if (lower.startsWith('ar') || lower.includes('ar-') || lower.includes('ar,')) return 'ar';
    if (lower.startsWith('en') || lower.includes('en-') || lower.includes('en,')) return 'en';
  }
  return 'tr';
}

