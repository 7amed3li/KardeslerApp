export type DomainErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'RESTAURANT_PAUSED'
  | 'RESTAURANT_CLOSED'
  | 'OUTSIDE_DELIVERY_ZONE'
  | 'MIN_ORDER_NOT_MET'
  | 'COD_LIMIT_EXCEEDED'
  | 'INVALID_COUPON'
  | 'ITEM_UNAVAILABLE'
  | 'INVALID_STATE_TRANSITION'
  | 'PAYMENT_AMOUNT_MISMATCH'
  | 'TOTP_SETUP_REQUIRED'
  | 'INTERNAL_ERROR';

export class DomainError extends Error {
  public readonly code: DomainErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: DomainErrorCode, statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
