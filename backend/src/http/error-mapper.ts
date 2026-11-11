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

    const pgCode: string | undefined = err?.code ?? err?.cause?.code;
    const pgMessage = String(err?.message ?? err?.cause?.message ?? '');

    if (pgCode === '42501') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Bu işlem için yetkiniz bulunmuyor', requestId } });
    }
    if (pgCode === 'P0002') {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'İstenen kayıt bulunamadı', requestId } });
    }
    if (pgCode === '23514' || pgCode === '22023' || pgCode === '23000') {
      const mapped = mapPgConstraintMessage(pgMessage, requestId);
      return reply.status(mapped.status).send(mapped.body);
    }
    if (pgCode === '23505') {
      return reply.status(409).send({ error: { code: 'CONFLICT', message: 'Bu kayıt zaten mevcut', requestId } });
    }

    request.log.error({ err: { name: err?.name, code: pgCode } }, 'Unhandled error');
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Sunucu hatası oluştu, lütfen tekrar deneyin', requestId },
    });
  });
}
