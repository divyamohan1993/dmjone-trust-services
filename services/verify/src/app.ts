/**
 * @dmjone/verify — the public, KEYLESS verification + gated-download service.
 *
 * Exposes `createVerifyApp(deps)`, a factory that takes its collaborators as
 * @dmjone/shared interfaces (dependency injection). The composition root that
 * wires the concrete crypto/data implementations lives in src/main.ts, written
 * by the orchestrator at integration time — this module never imports a
 * concrete sibling package and never touches a private key.
 *
 * Surfaces:
 *   GET  /health, /health/ready              liveness / readiness
 *   GET  /c/:credentialId                    the distinct, web-native credential page (HTML)
 *   GET  /api/verify/:credentialId           VerificationResult by id lookup (JSON)
 *   POST /api/verify/file                    upload a file → tamper check (JSON, no password)
 *   POST /api/download                       credential id + password → stream the signed PDF
 *   GET  /api/credentials/:id/section63      the §63 certificate-of-authenticity (public PDF)
 */

import { randomUUID, randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type {
  AnchorRepository,
  AppEnv,
  AuditLog,
  BlobStore,
  CredentialRecord,
  CredentialRepository,
  LogRepository,
  LogVerifier,
  PasswordHasher,
  SignatureVerifier,
  VerificationChecks,
  VerificationResult,
} from '@dmjone/shared';
import {
  AppError,
  ERROR_CODE,
  credentialIdParamSchema,
  downloadSchema,
} from '@dmjone/shared';
import { checkAnchor, checkLogInclusion, deriveOutcome, publicFieldsOf } from './verification.js';
import { RateLimiter } from './rate-limit.js';
import { renderCredentialPage, renderErrorPage, renderLandingPage } from './page.js';

/**
 * A single structured-log method. Two overloads matching how the service calls
 * its logger — `(obj, msg?)` and `(msg)` — which is exactly the calling
 * convention pino's `LogFn` provides, so a pino logger is assignable here
 * without the service importing pino's concrete (heavily generic) types.
 */
export interface LogFn {
  (obj: object, msg?: string): void;
  (msg: string): void;
}

/** The minimal logger shape the service uses (a structural subset of pino). */
export interface Logger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
}

/** Everything the verify service depends on, all as shared interfaces (DI). */
export interface VerifyDeps {
  env: AppEnv;
  logger: Logger;
  credentialRepo: CredentialRepository;
  blobStore: BlobStore;
  logRepo: LogRepository;
  anchorRepo: AnchorRepository;
  auditLog: AuditLog;
  verifier: SignatureVerifier;
  logVerifier: LogVerifier;
  passwordHasher: PasswordHasher;
  /**
   * SHA-256 fingerprint of the issuer's trusted PAdES signing certificate
   * (computed by the crypto layer over our X.509 cert, supplied by the
   * composition root). The file-upload flow treats the embedded PAdES signature
   * as valid ONLY when the uploaded PDF's signing cert matches this fingerprint
   * — because `verifyPdfPades` reports `intact:true` for any internally
   * consistent signature, even one made by a SWAPPED foreign cert. Pinning the
   * fingerprint makes "PAdES valid" mean "signed by dmj.one Trust Services",
   * not merely "signed by someone". Required: the keyless verify service cannot
   * make a trustworthy PAdES claim without it.
   */
  trustedPadesCertFingerprint: string;
  /**
   * A real Argon2id PHC string used to timing-equalise "missing credential"
   * download attempts. The composition root computes it ONCE at startup via
   * `passwordHasher.hash(<random>)`, so it always carries the SAME params the
   * hasher currently mints — making an unknown-credential verify cost exactly
   * as much as a wrong-password verify (the hasher re-derives using the params
   * embedded in the stored string). This closes the credential-existence
   * *timing* oracle and stays correct even if the cost params change. When
   * absent, the service falls back to {@link buildDummyPasswordHash} (env-derived
   * params) so unit tests run without wiring it. Prefer the injected value.
   */
  dummyPasswordHash?: string;
  /** Injectable clock (tests drive backoff deterministically). Defaults to Date.now. */
  now?: () => number;
}

/** Per-request values stashed on the Hono context. */
interface RequestVars {
  requestId: string;
  /** CSP nonce, unique per request; every inline <script> must carry it. */
  nonce: string;
}

type AppContext = Context<{ Variables: RequestVars }>;

/** Largest upload accepted by /api/verify/file. Generous for a PDF, cheap to reject above. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MiB

/**
 * Build the dummy Argon2id PHC string used to timing-equalise "missing id"
 * download attempts (so a missing id still pays the full KDF cost and can't be
 * told apart from a wrong password by response time).
 *
 * The cost params are interpolated from the SAME env values the issuer stamps
 * into real stored hashes, because the hasher's `verify` re-derives using the
 * params parsed FROM the stored string — a hard-coded mismatch (e.g. heavier
 * m/t/p) would make a miss measurably slower than a real wrong-password verify,
 * reopening the timing oracle. The envelope (6 `$`-segments, v=19, 3 comma
 * params, 16-byte salt + 32-byte hash, base64 no-pad) is exactly what the
 * crypto package's PHC parser requires; a malformed string would make `verify`
 * fast-fail before doing any KDF work, which is the very leak we are closing.
 *
 * Residual assumption (v1-safe): parity holds only while this verify service's
 * Argon2 env matches the params the issuer used at issue time. In v1 both derive
 * from the shared ARGON2_DEFAULTS, so it holds; a future per-service override
 * would need this revisited.
 */
function buildDummyPasswordHash(env: AppEnv): string {
  const params = `m=${env.ARGON2_MEMORY_KIB},t=${env.ARGON2_ITERATIONS},p=${env.ARGON2_PARALLELISM}`;
  const saltB64 = 'A'.repeat(22); // 16 zero bytes, base64 no-pad
  const hashB64 = 'A'.repeat(43); // 32 zero bytes, base64 no-pad
  return `$argon2id$v=19$${params}$${saltB64}$${hashB64}`;
}

function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

/** Build the canonical ApiError body and throw it as an HTTP response. */
function fail(code: keyof typeof ERROR_CODE, message: string, status: number): never {
  throw new AppError(ERROR_CODE[code], message, status);
}

export function createVerifyApp(deps: VerifyDeps): Hono<{ Variables: RequestVars }> {
  const { env, logger } = deps;
  const now = deps.now ?? Date.now;
  const app = new Hono<{ Variables: RequestVars }>();

  // Download brute-force throttle. Cheap rejects before any Argon2id work.
  const downloadLimiter = new RateLimiter({ now, threshold: 5, baseMs: 1_000, capMs: 60 * 60 * 1_000 });
  // Dummy hash for timing-equalising missing-id download attempts (params match
  // what the issuer stamps into real hashes, so a miss does identical KDF work).
  // Prefer the injected, hasher-minted value (always current params); fall back
  // to an env-derived PHC when running without the composition root (unit tests).
  const dummyPasswordHash = deps.dummyPasswordHash ?? buildDummyPasswordHash(env);

  const issuerName = env.TRUST_SERVICE_NAME;
  // Explicit CORS allow-list — never `*`. The verify origin plus the issuer origin.
  const allowedOrigins = new Set([env.VERIFY_PUBLIC_URL, env.ISSUER_PUBLIC_URL]);

  // ── Correlation id + structured request logging ───────────────────────────
  app.use('*', async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const requestId = incoming && /^[\w-]{1,128}$/.test(incoming) ? incoming : randomUUID();
    c.set('requestId', requestId);
    c.set('nonce', randomBytes(16).toString('base64'));
    c.header('x-request-id', requestId);
    await next();
    logger.info(
      { requestId, method: c.req.method, path: c.req.path, status: c.res.status },
      'request',
    );
  });

  // ── Security headers (defence in depth on every response) ──────────────────
  app.use('*', async (c, next) => {
    await next();
    const nonce = c.get('nonce');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    c.header('Cross-Origin-Opener-Policy', 'same-origin');
    c.header('Cross-Origin-Resource-Policy', 'same-origin');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    // Nonce-based CSP: scripts/styles must carry the per-request nonce; no
    // unsafe-inline, no remote origins. Self-contained page = tiny attack surface.
    c.header(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "base-uri 'none'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "img-src 'self' data:",
        `style-src 'self' 'nonce-${nonce}'`,
        `script-src 'self' 'nonce-${nonce}'`,
        "connect-src 'self'",
        "form-action 'self'",
      ].join('; '),
    );
  });

  // ── CORS for the JSON API (explicit origins only) ──────────────────────────
  app.use('/api/*', async (c, next) => {
    const origin = c.req.header('origin');
    if (origin && allowedOrigins.has(origin)) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Vary', 'Origin');
      c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      c.header('Access-Control-Allow-Headers', 'Content-Type, X-Request-Id');
      c.header('Access-Control-Max-Age', '600');
    }
    if (c.req.method === 'OPTIONS') return c.body(null, 204);
    await next();
  });

  // ── Health ─────────────────────────────────────────────────────────────────
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/health/ready', async (c) => {
    // Deep-ish: the verify service is ready if it can reach the log head store.
    try {
      await deps.logRepo.getHead();
      return c.json({ status: 'ready' });
    } catch (err) {
      logger.error({ err: String(err) }, 'readiness probe failed');
      return c.json({ status: 'unready' }, 503);
    }
  });

  // ── Landing (bare domain): branded entry; `?id=…` redirects to /c/:id ──────
  app.get('/', (c) => {
    const id = c.req.query('id');
    if (id) {
      const parsed = credentialIdParamSchema.safeParse({ credentialId: id.trim() });
      if (parsed.success) {
        return c.redirect(`/c/${encodeURIComponent(parsed.data.credentialId)}`, 302);
      }
    }
    return c.html(renderLandingPage({ nonce: c.get('nonce'), issuer: issuerName }));
  });

  // ── The public credential page (distinct, web-native, SSR) ─────────────────
  app.get('/c/:credentialId', async (c) => {
    const parsed = credentialIdParamSchema.safeParse({ credentialId: c.req.param('credentialId') });
    const nonce = c.get('nonce');
    if (!parsed.success) {
      return c.html(renderErrorPage({ nonce, issuer: issuerName }), 404);
    }
    const record = await deps.credentialRepo.getById(parsed.data.credentialId);
    if (!record) {
      return c.html(renderErrorPage({ nonce, issuer: issuerName }), 404);
    }
    // Compute the REAL verification result server-side so the no-JS badge is a
    // genuine cryptographic verdict (court-presentable), not a status echo. The
    // client script later re-runs the same check live for the animated ledger.
    const checks = await buildChecks(deps, record);
    const html = renderCredentialPage({
      record,
      issuer: issuerName,
      issuerLegalName: env.ISSUER_LEGAL_NAME,
      verifyBaseUrl: env.VERIFY_PUBLIC_URL,
      nonce,
      verification: { outcome: deriveOutcome(checks), checks },
    });
    return c.html(html);
  });

  // ── Verify by id (JSON) ────────────────────────────────────────────────────
  app.get('/api/verify/:credentialId', async (c) => {
    const parsed = credentialIdParamSchema.safeParse({ credentialId: c.req.param('credentialId') });
    if (!parsed.success) {
      fail('VALIDATION_FAILED', 'Invalid credential id.', 400);
    }
    const result = await verifyById(deps, parsed.data.credentialId, issuerName);
    return c.json(result);
  });

  // ── Verify an uploaded file (JSON, no password — employer flow) ────────────
  app.post('/api/verify/file', async (c) => {
    const contentType = c.req.header('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      fail('BAD_REQUEST', 'Expected multipart/form-data with a credentialId and a file.', 400);
    }
    const body = await c.req.parseBody();
    const credentialId = typeof body['credentialId'] === 'string' ? body['credentialId'] : '';
    const file = body['file'];
    const idCheck = credentialIdParamSchema.safeParse({ credentialId });
    if (!idCheck.success) {
      fail('VALIDATION_FAILED', 'Invalid or missing credential id.', 400);
    }
    if (!(file instanceof File)) {
      fail('BAD_REQUEST', 'A file is required.', 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      fail('BAD_REQUEST', 'File too large.', 413);
    }
    const uploaded = new Uint8Array(await file.arrayBuffer());
    const result = await verifyFile(deps, idCheck.data.credentialId, uploaded, issuerName);
    return c.json(result);
  });

  // ── Password-gated download of the signed certificate PDF ──────────────────
  app.post('/api/download', async (c) => {
    const requestId = c.get('requestId');
    const clientKey = clientKeyOf(c);

    // Cheap reject FIRST: throttled clients never reach the Argon2id path.
    const pre = downloadLimiter.check(clientKey);
    if (pre.blocked) {
      c.header('Retry-After', String(pre.retryAfterSeconds));
      fail('RATE_LIMITED', 'Too many attempts. Try again later.', 429);
    }

    let parsed: { credentialId: string; password: string };
    try {
      const json = await c.req.json();
      const result = downloadSchema.safeParse(json);
      if (!result.success) {
        fail('VALIDATION_FAILED', 'Invalid download request.', 400);
      }
      parsed = result.data;
    } catch {
      fail('VALIDATION_FAILED', 'Invalid download request.', 400);
    }

    const record = await deps.credentialRepo.getById(parsed.credentialId);
    // Timing-equalise: a missing id still runs a verify against a fixed dummy
    // hash, so the response time can't be used to probe which ids exist.
    const storedHash = record?.passwordHash ?? dummyPasswordHash;
    // Wrap the verify: a well-formed-but-non-matching PHC string can make some
    // Argon2id implementations THROW. If the dummy-hash path threw while the
    // real-record path merely returned false, the resulting 500-vs-403 would
    // leak whether the id exists. Collapse any throw to a plain "false" so the
    // missing-id and wrong-password responses stay byte-identical.
    let ok = false;
    try {
      ok = await deps.passwordHasher.verify(parsed.password, storedHash);
    } catch (err) {
      deps.logger.warn({ requestId, err: String(err) }, 'password verify threw');
      ok = false;
    }

    if (!record || !ok) {
      downloadLimiter.recordFailure(clientKey);
      await safeAudit(deps, {
        actor: 'public',
        action: 'download.denied',
        subject: parsed.credentialId,
        requestId,
      });
      // Identical generic failure for "no such id" and "wrong password".
      fail('DOWNLOAD_AUTH_FAILED', 'Verification failed. Check your details and try again.', 403);
    }

    const bytes = await deps.blobStore.get(record.id, 'certificate');
    if (!bytes) {
      // The record exists but its bytes are missing — an internal fault, not an
      // auth signal. Still generic to the client.
      logger.error({ requestId, credentialId: record.id }, 'certificate bytes missing for record');
      fail('INTERNAL', 'Unable to complete the download. Please try again later.', 500);
    }

    downloadLimiter.reset(clientKey);
    await safeAudit(deps, {
      actor: 'public',
      action: 'download.success',
      subject: record.id,
      requestId,
    });
    return pdfResponse(c, bytes, `${record.id}.pdf`);
  });

  // ── §63 certificate of authenticity (public — a legal/verification artifact)
  app.get('/api/credentials/:credentialId/section63', async (c) => {
    const parsed = credentialIdParamSchema.safeParse({ credentialId: c.req.param('credentialId') });
    if (!parsed.success) {
      fail('VALIDATION_FAILED', 'Invalid credential id.', 400);
    }
    const bytes = await deps.blobStore.get(parsed.data.credentialId, 'section63');
    if (!bytes) {
      fail('CREDENTIAL_NOT_FOUND', 'No certificate of authenticity for that credential.', 404);
    }
    return pdfResponse(c, bytes, `${parsed.data.credentialId}-section63.pdf`, 'inline');
  });

  // ── Uniform error + 404 handling ───────────────────────────────────────────
  app.notFound((c) => {
    const requestId = c.get('requestId') ?? randomUUID();
    return c.json(
      { error: 'Not found.', code: ERROR_CODE.NOT_FOUND, requestId },
      404,
    );
  });

  app.onError((err, c) => {
    const requestId = c.get('requestId') ?? randomUUID();
    if (err instanceof AppError) {
      return c.json(err.toResponse(requestId), err.httpStatus as 400);
    }
    logger.error({ requestId, err: String(err) }, 'unhandled error');
    return c.json(
      { error: 'Internal server error.', code: ERROR_CODE.INTERNAL, requestId },
      500,
    );
  });

  return app;
}

// ───────────────────────────── verification flows ────────────────────────────

/** Verify a credential by id lookup. No PAdES check (that needs the file). */
async function verifyById(
  deps: VerifyDeps,
  credentialId: string,
  issuer: string,
): Promise<VerificationResult> {
  const record = await deps.credentialRepo.getById(credentialId);
  const verifiedAt = new Date().toISOString();
  if (!record) {
    return {
      credentialId,
      outcome: 'unknown',
      checks: {
        mldsaSignature: false,
        hashMatch: false,
        logInclusion: false,
        anchorProof: false,
        notRevoked: false,
      },
      verifiedAt,
    };
  }
  const checks = await buildChecks(deps, record);
  return {
    credentialId,
    outcome: deriveOutcome(checks),
    checks,
    publicFields: publicFieldsOf(record, issuer),
    verifiedAt,
  };
}

/** Verify an uploaded file against the stored record (adds hashMatch + PAdES). */
async function verifyFile(
  deps: VerifyDeps,
  credentialId: string,
  uploaded: Uint8Array,
  issuer: string,
): Promise<VerificationResult> {
  const record = await deps.credentialRepo.getById(credentialId);
  const verifiedAt = new Date().toISOString();
  if (!record) {
    return {
      credentialId,
      outcome: 'unknown',
      checks: {
        mldsaSignature: false,
        hashMatch: false,
        logInclusion: false,
        anchorProof: false,
        notRevoked: false,
      },
      verifiedAt,
    };
  }

  // Decisive tamper gate: the uploaded bytes must hash to exactly what we
  // signed. A swapped, re-signed, or 1-bit-altered file fails here → 'tampered'
  // (deriveOutcome ranks this above everything). This does not depend on PAdES.
  const hashMatch = sha256Hex(uploaded) === record.pdfSha256;
  // PAdES is only meaningful against an actual file. Tolerate verifier faults
  // as "not intact" rather than 500-ing the whole verification.
  let padesSignature = false;
  try {
    const pades = await deps.verifier.verifyPdfPades(uploaded);
    // `intact:true` only means the embedded signature is internally consistent —
    // a PDF carrying a SWAPPED foreign cert can also read intact. So pin the
    // signing cert to our trusted fingerprint (and, defence in depth, to this
    // credential's recorded fingerprint). Only then does "PAdES valid" mean
    // "signed by dmj.one Trust Services".
    const fpOk =
      pades.certFingerprint === deps.trustedPadesCertFingerprint &&
      pades.certFingerprint === record.padesCertFingerprint;
    padesSignature = pades.present && pades.intact && fpOk;
  } catch (err) {
    deps.logger.warn({ credentialId, err: String(err) }, 'PAdES verification threw');
  }

  const base = await buildChecks(deps, record);
  const checks: VerificationChecks = { ...base, hashMatch, padesSignature };
  return {
    credentialId,
    outcome: deriveOutcome(checks),
    checks,
    publicFields: publicFieldsOf(record, issuer),
    verifiedAt,
  };
}

/**
 * Build the id-lookup check set for a known record (no padesSignature key — it
 * is added only by the file flow; under exactOptionalPropertyTypes we omit it
 * rather than set it undefined). hashMatch is true by construction for id
 * lookup: we serve the exact persisted bytes, so there is nothing to mismatch.
 */
async function buildChecks(
  deps: VerifyDeps,
  record: CredentialRecord,
): Promise<VerificationChecks> {
  const [logInclusion, anchorProof] = await Promise.all([
    checkLogInclusion(record, deps.logRepo, deps.logVerifier),
    checkAnchor(record, deps.anchorRepo),
  ]);
  const mldsaSignature = deps.verifier.verifyMldsa(
    record.content,
    record.pdfSha256,
    record.mldsaSignature,
  );
  return {
    mldsaSignature,
    hashMatch: true,
    logInclusion,
    anchorProof,
    notRevoked: record.status === 'valid',
  };
}

// ──────────────────────────────── helpers ────────────────────────────────────

/** Stream raw PDF bytes with the right disposition; never cache a private doc. */
function pdfResponse(
  c: AppContext,
  bytes: Uint8Array,
  filename: string,
  disposition: 'attachment' | 'inline' = 'attachment',
): Response {
  // Copy into a fresh ArrayBuffer so the BodyInit is a clean ArrayBuffer slice.
  const buf = bytes.slice().buffer;
  c.header('Content-Type', 'application/pdf');
  c.header('Content-Disposition', `${disposition}; filename="${filename}"`);
  c.header('Content-Length', String(bytes.byteLength));
  c.header('Cache-Control', 'no-store');
  return c.body(buf);
}

/** Identify the client for rate-limiting: trusted CF/proxy header, else peer. */
function clientKeyOf(c: AppContext): string {
  const cf = c.req.header('cf-connecting-ip');
  if (cf) return `ip:${cf}`;
  const xff = c.req.header('x-forwarded-for');
  if (xff) return `ip:${xff.split(',')[0]?.trim()}`;
  return 'ip:unknown';
}

/** Audit without letting an audit-store hiccup fail the user-facing request. */
async function safeAudit(
  deps: VerifyDeps,
  event: { actor: 'public'; action: string; subject?: string; requestId?: string },
): Promise<void> {
  try {
    await deps.auditLog.append(event);
  } catch (err) {
    deps.logger.error({ err: String(err), action: event.action }, 'audit append failed');
  }
}
