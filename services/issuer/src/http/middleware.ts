/**
 * Cross-cutting HTTP middleware: correlation ids, security headers (nonce CSP),
 * a uniform {@link ApiError} error funnel, and the admin session gate.
 *
 * Every response — success or failure — carries the hardening headers and a
 * request id. Errors are normalised to the one `ApiError` shape so both
 * services speak an identical error language. No secret ever reaches a log line
 * (we log error objects and codes, never request bodies or cookies).
 */

import { randomUUID } from 'node:crypto';

import type { Context, ErrorHandler, MiddlewareHandler, Next } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { AppError, ERROR_CODE } from '@dmjone/shared';
import type { ApiError, ErrorCode } from '@dmjone/shared';

import type { IssuerDeps } from '../deps.js';
import { readSession } from '../auth/session.js';
import type { IssuerHonoEnv } from './context.js';

const REQUEST_ID_HEADER = 'x-request-id';

/** Map an {@link ErrorCode} to its HTTP status when the throw site didn't set one. */
const CODE_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  INTERNAL: 500,
  RATE_LIMITED: 429,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  AUTH_CHALLENGE_FAILED: 401,
  ACCOUNT_LOCKED: 423,
  CREDENTIAL_EXISTS: 409,
  CREDENTIAL_NOT_FOUND: 404,
  CREDENTIAL_REVOKED: 409,
  TAMPER_DETECTED: 422,
  DOWNLOAD_AUTH_FAILED: 401,
  SIGNING_FAILED: 500,
  LOG_APPEND_FAILED: 500,
  LOG_CONFLICT: 409,
  ANCHOR_FAILED: 502,
};

/**
 * Attach a correlation id (honour an inbound `x-request-id`, else generate) and
 * echo it on the response. Stored on the context for handlers + the error
 * funnel + audit entries.
 */
export function requestId(): MiddlewareHandler<IssuerHonoEnv> {
  return async (c, next) => {
    const inbound = c.req.header(REQUEST_ID_HEADER);
    const id = inbound && inbound.length <= 200 ? inbound : randomUUID();
    c.set('requestId', id);
    c.header(REQUEST_ID_HEADER, id);
    await next();
  };
}

/** Write the standard hardening headers (incl. a nonce-based CSP) onto a response. */
function applySecurityHeaders(c: Context<IssuerHonoEnv>, nonce: string | undefined): void {
  const n = nonce ?? '';
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${n}'`,
    `style-src 'self' 'nonce-${n}'`,
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
  ].join('; ');

  c.header('Content-Security-Policy', csp);
  c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
  c.header('Cross-Origin-Resource-Policy', 'same-origin');
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
}

/**
 * Per-request CSP nonce + the standard hardening headers on every response.
 * The nonce is exposed on the context so server-rendered inline scripts/styles
 * can reference it (no `unsafe-inline`, no third-party origins). On the error
 * path the chain throws before this runs, so {@link errorHandler} re-applies the
 * same headers.
 */
export function securityHeaders(): MiddlewareHandler<IssuerHonoEnv> {
  return async (c, next) => {
    const nonce = randomUUID().replace(/-/g, '');
    c.set('cspNonce', nonce);
    await next();
    applySecurityHeaders(c, nonce);
  };
}

/** Build the uniform error body from any thrown value. */
function toApiError(err: unknown, requestIdValue: string): { status: number; body: ApiError } {
  if (err instanceof AppError) {
    const status = err.httpStatus || CODE_STATUS[err.code] || 400;
    return { status, body: err.toResponse(requestIdValue) };
  }
  // Unknown/unexpected: never leak internals to the client.
  const body: ApiError = {
    error: 'Internal server error',
    code: ERROR_CODE.INTERNAL,
    requestId: requestIdValue,
  };
  return { status: 500, body };
}

/**
 * Top-level error funnel, registered via `app.onError`. In Hono, an error
 * thrown by a handler is dispatched here (it does NOT unwind through upstream
 * middleware try/catch), so this is the single authoritative place that turns
 * any thrown {@link AppError} — or unexpected error — into the uniform JSON
 * shape with the correct status. Hardening headers are re-applied here because
 * the post-`next()` header pass of {@link securityHeaders} is skipped when the
 * chain throws.
 */
export function errorHandler(deps: IssuerDeps): ErrorHandler<IssuerHonoEnv> {
  return (err, c) => {
    const id = c.get('requestId') ?? 'unknown';
    const { status, body } = toApiError(err, id);
    if (status >= 500) {
      deps.logger.error({ err, requestId: id, path: c.req.path }, 'unhandled request error');
    } else {
      deps.logger.warn({ code: body.code, requestId: id, path: c.req.path }, 'request rejected');
    }
    applySecurityHeaders(c, c.get('cspNonce'));
    return c.json(body, status as ContentfulStatusCode);
  };
}

/**
 * Require a valid admin session. On failure, throw UNAUTHENTICATED so the error
 * funnel renders the uniform 401 body. On success, the session is attached to
 * the context for downstream handlers + audit.
 */
export function requireAdmin(deps: IssuerDeps): MiddlewareHandler<IssuerHonoEnv> {
  return async (c: Context<IssuerHonoEnv>, next: Next) => {
    const session = await readSession(c, deps.env);
    if (!session) {
      throw new AppError(ERROR_CODE.UNAUTHENTICATED, 'Authentication required', 401);
    }
    c.set('session', session);
    await next();
  };
}
