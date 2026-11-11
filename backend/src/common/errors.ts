import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'RESTAURANT_PAUSED'
  | 'OUTSIDE_DELIVERY_ZONE'
  | 'MIN_ORDER_NOT_MET'
  | 'COD_LIMIT_EXCEEDED'
  | 'INVALID_COUPON'
  | 'ITEM_UNAVAILABLE'
  | 'INVALID_STATE_TRANSITION'
  | 'PAYMENT_AMOUNT_MISMATCH'
  | 'TOTP_SETUP_REQUIRED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: ErrorCode, statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function registerGlobalErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: any, request, reply) => {
    const requestId = request.id;

    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        error: {
          code: err.code,
          message: err.message,
          requestId,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      });
    }

    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: err.issues[0]?.message ?? 'Geçersiz istek verisi',
          requestId,
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
    }

    // Map known PostgreSQL domain/stored-function exceptions safely without leaking SQL internals
    const pgCode: string | undefined = err?.code ?? err?.cause?.code;
    const pgMessage: string = String(err?.message ?? err?.cause?.message ?? '');

    if (pgCode === '42501') {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Bu işlem için yetkiniz bulunmuyor',
          requestId,
        },
      });
    }

    if (pgCode === 'P0002') {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'İstenen kayıt bulunamadı',
          requestId,
        },
      });
    }

    if (pgCode === '23514' || pgCode === '22023' || pgCode === '23000') {
      if (pgMessage.includes('outside our delivery zones')) {
        return reply.status(422).send({
          error: {
            code: 'OUTSIDE_DELIVERY_ZONE',
            message: 'Seçilen adres teslimat bölgemiz dışında kalmaktadır',
            requestId,
          },
        });
      }
      if (pgMessage.includes('below delivery zone minimum')) {
        return reply.status(422).send({
          error: {
            code: 'MIN_ORDER_NOT_MET',
            message: 'İndirim sonrası tutar bölge minimum paket tutarının altındadır',
            requestId,
          },
        });
      }
      if (pgMessage.includes('Cash on delivery')) {
        return reply.status(422).send({
          error: {
            code: 'COD_LIMIT_EXCEEDED',
            message: 'Kapıda ödeme limiti veya açık sipariş sınırı aşıldı',
            requestId,
          },
        });
      }
      if (pgMessage.includes('Coupon')) {
        return reply.status(422).send({
          error: {
            code: 'INVALID_COUPON',
            message: 'Kupon bu sipariş için geçerli değil veya kullanım sınırına ulaştı',
            requestId,
          },
        });
      }
      if (pgMessage.includes('paused and not accepting orders')) {
        return reply.status(503).send({
          error: {
            code: 'RESTAURANT_PAUSED',
            message: 'Restoran şu anda yeni sipariş kabul etmiyor',
            requestId,
          },
        });
      }
      if (pgMessage.includes('Invalid order status transition')) {
        return reply.status(409).send({
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: 'Geçersiz sipariş durumu geçişi',
            requestId,
          },
        });
      }
      if (pgMessage.includes('unavailable') || pgMessage.includes('Option')) {
        return reply.status(422).send({
          error: {
            code: 'ITEM_UNAVAILABLE',
            message: 'Seçilen ürün veya seçenek şu anda mevcut değil ya da zorunlu seçim eksik',
            requestId,
          },
        });
      }

      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'İşlem kuralları doğrulaması başarısız oldu',
          requestId,
        },
      });
    }

    if (pgCode === '23505') {
      return reply.status(409).send({
        error: {
          code: 'CONFLICT',
          message: 'Bu kayıt zaten mevcut',
          requestId,
        },
      });
    }

    request.log.error({ err: { name: err?.name, code: pgCode } }, 'Unhandled error');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Sunucu hatası oluştu, lütfen tekrar deneyin',
        requestId,
      },
    });
  });
}

