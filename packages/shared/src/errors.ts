/**
 * Uniform error contract. Every API error response across both services uses
 * {@link ApiError}. Codes are stable strings safe to branch on client-side.
 */

export const ERROR_CODE = {
  // Generic
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL: 'INTERNAL',
  RATE_LIMITED: 'RATE_LIMITED',
  // Auth
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  AUTH_CHALLENGE_FAILED: 'AUTH_CHALLENGE_FAILED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  // Credential / verification
  CREDENTIAL_EXISTS: 'CREDENTIAL_EXISTS',
  CREDENTIAL_NOT_FOUND: 'CREDENTIAL_NOT_FOUND',
  CREDENTIAL_REVOKED: 'CREDENTIAL_REVOKED',
  TAMPER_DETECTED: 'TAMPER_DETECTED',
  DOWNLOAD_AUTH_FAILED: 'DOWNLOAD_AUTH_FAILED',
  // Signing / log
  SIGNING_FAILED: 'SIGNING_FAILED',
  LOG_APPEND_FAILED: 'LOG_APPEND_FAILED',
  /** Transient: the transparency/audit head moved under us; caller recomputes + retries. */
  LOG_CONFLICT: 'LOG_CONFLICT',
  ANCHOR_FAILED: 'ANCHOR_FAILED',
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

/** The shape of every error response body. */
export interface ApiError {
  error: string;
  code: ErrorCode;
  requestId: string;
  details?: unknown;
}

/** Throwable application error carrying an {@link ErrorCode} + HTTP status. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, httpStatus = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }

  toResponse(requestId: string): ApiError {
    const body: ApiError = { error: this.message, code: this.code, requestId };
    if (this.details !== undefined) body.details = this.details;
    return body;
  }
}
