import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { DomainError } from '../domain/errors.js';

function mapPgConstraintMessage(pgMessage: string, requestId: string): { status: number; body: Record<string, unknown> } {
  const rules: [string, number, string, string][] = [
    ['outside our delivery zones', 422, 'OUTSIDE_DELIVERY_ZONE', 'Seçilen adres teslimat bölgemiz dışında kalmaktadır'],
    ['below delivery zone minimum', 422, 'MIN_ORDER_NOT_MET', 'İndirim sonrası tutar bölge minimum paket tutarının altındadır'],
    ['Cash on delivery', 422, 'COD_LIMIT_EXCEEDED', 'Kapıda ödeme limiti veya açık sipariş sınırı aşıldı'],
    ['Coupon', 422, 'INVALID_COUPON', 'Kupon bu sipariş için geçerli değil veya kullanım sınırına ulaştı'],
    ['paused and not accepting orders', 503, 'RESTAURANT_PAUSED', 'Restoran şu anda yeni sipariş kabul etmiyor'],
    ['Invalid order status transition', 409, 'INVALID_STATE_TRANSITION', 'Geçersiz sipariş durumu geçişi'],
  ];

  for (const [needle, status, code, msg] of rules) {
    if (pgMessage.includes(needle)) {
      return { status, body: { error: { code, message: msg, requestId } } };
    }
  }
  if (pgMessage.includes('unavailable') || pgMessage.includes('Option')) {
    return {
      status: 422,
      body: {
        error: { code: 'ITEM_UNAVAILABLE', message: 'Seçilen ürün veya seçenek şu anda mevcut değil ya da zorunlu seçim eksik', requestId },
      },
    };
  }
  return {
    status: 400,
    body: { error: { code: 'VALIDATION_ERROR', message: 'İşlem kuralları doğrulaması başarısız oldu', requestId } },
  };
}

function extractPgError(err: unknown): { code?: string; message: string } {
  let cur: any = err;
  let code: string | undefined;
  const messages: string[] = [];
  for (let depth = 0; depth < 5 && cur && typeof cur === 'object'; depth++) {
    if (!code && typeof cur.code === 'string') code = cur.code;
    if (typeof cur.message === 'string') messages.push(cur.message);
    cur = cur.cause;
  }
  return { code, message: messages.reverse().join(' | ') };
}

function mapPgAndInfraError(err: any, requestId: string): { status: number; body: Record<string, unknown>; pgCode?: string } | null {
  const { code: pgCode, message: pgMessage } = extractPgError(err);
  if (
    err?.name === 'MaxRetriesPerRequestError' ||
    pgMessage.includes("Stream isn't writeable") ||
    pgMessage.includes('Connection is closed') ||
    pgMessage.includes('Command timed out') ||
    pgCode === 'ECONNREFUSED'
  ) {
    return { status: 503, body: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Gerçek zamanlı servis veya önbellek geçici olarak erişilemiyor', requestId } }, pgCode };
  }
  if (typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
    return { status: err.statusCode, body: { error: { code: 'VALIDATION_ERROR', message: err.statusCode === 413 ? 'İstek boyutu sınırı aşıldı' : 'Geçersiz HTTP isteği', requestId } }, pgCode };
  }
  if (pgCode === '42501') return { status: 403, body: { error: { code: 'FORBIDDEN', message: 'Bu işlem için yetkiniz bulunmuyor', requestId } }, pgCode };
  if (pgCode === 'P0002') return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'İstenen kayıt bulunamadı', requestId } }, pgCode };
  if (pgCode === 'P0001' || pgCode === '23514' || pgCode === '22023' || pgCode === '23000') {
    return { ...mapPgConstraintMessage(pgMessage, requestId), pgCode };
  }
  if (pgCode === '23505') return { status: 409, body: { error: { code: 'CONFLICT', message: 'Bu kayıt zaten mevcut', requestId } }, pgCode };
  if (pgCode === '23503') return { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'İlişkili kayıt bulunamadı', requestId } }, pgCode };
  return null;
}

export function registerHttpErrorMapper(app: FastifyInstance): void {
  app.setErrorHandler((err: any, request, reply) => {
    const requestId = request.id;

    if (err instanceof DomainError) {
      return reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, requestId, ...(err.details !== undefined ? { details: err.details } : {}) },
      });
    }

    if (err instanceof ZodError || Array.isArray(err?.validation)) {
      const details =
        err instanceof ZodError
          ? err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
          : err.validation;
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: err instanceof ZodError ? err.issues[0]?.message ?? 'Geçersiz istek verisi' : 'Geçersiz istek verisi',
          requestId,
          details,
        },
      });
    }

    const mapped = mapPgAndInfraError(err, requestId);
    if (mapped) return reply.status(mapped.status).send(mapped.body);

    const { code: pgCode } = extractPgError(err);
    request.log.error({ err: { name: err?.name, code: pgCode } }, 'Unhandled error');
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Sunucu hatası oluştu, lütfen tekrar deneyin', requestId },
    });
  });
}

