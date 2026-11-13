export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'CONFLICT'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN_ERROR';

export class ApiClientError extends Error {
  readonly code: ApiErrorCode | string;
  readonly status: number;
  readonly requestId?: string;

  constructor(params: {
    code: ApiErrorCode | string;
    message: string;
    status: number;
    requestId?: string;
  }) {
    super(params.message);
    this.name = 'ApiClientError';
    this.code = params.code;
    this.status = params.status;
    this.requestId = params.requestId;
  }
}

export function normalizeApiError(payload: unknown, status: number): ApiClientError {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const err = (payload as { error?: { code?: string; message?: string; requestId?: string } }).error;
    if (err && typeof err === 'object') {
      return new ApiClientError({
        code: err.code ?? 'UNKNOWN_ERROR',
        message: err.message ?? `HTTP ${status}`,
        status,
        requestId: err.requestId,
      });
    }
  }
  return new ApiClientError({
    code: status === 401 ? 'UNAUTHORIZED' : status === 429 ? 'RATE_LIMITED' : 'UNKNOWN_ERROR',
    message: `HTTP ${status}`,
    status,
  });
}

