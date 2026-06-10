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
  documentKind,
  downloadSchema,
} from '@dmjone/shared';
import { checkAnchor, checkLogInclusion, deriveOutcome, publicFieldsOf } from './verification.js';
import { RateLimiter } from './rate-limit.js';
import { renderCredentialPage, renderErrorPage, renderLandingPage } from './page.js';
import { FONT_BYTES, isFontFile } from './fonts/font-bytes.js';

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
   * The issuer's PUBLIC verification keys, base64-encoded, so the court-ready
   * evidence bundle (GET /api/credentials/:id/evidence) is SELF-CONTAINED: an
   * opposing expert can re-verify the ML-DSA-87 record signature and the signed
   * transparency-log head with NO access to dmj.one. These are public keys only —
   * the keyless verify service never holds a private key. Wired by the composition
   * root from the already-loaded `verifyingKeys` (Uint8Array → base64).
   */
  evidenceKeys: { mldsaPublicKeyBase64: string; logMldsaPublicKeyBase64: string };
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

/**
 * Decode standard base64 → bytes WITHOUT importing a concrete crypto sibling
 * (the keyless DI layer must not). Same primitive `runtime/keys.ts` uses for the
 * public key blob. Used to recover the RAW ML-DSA signature bytes that the
 * RFC-3161 token was computed over (verifyTimestamp wants the bytes, not base64).
 */
function b64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/**
 * Compute the record's RFC-3161 trusted-timestamp verification, server-side and
 * never-throwing, so both the SSR page line and the evidence bundle agree. The
 * token (when present) was minted over the RAW ML-DSA signature bytes, so we
 * decode `record.mldsaSignature` before verifying. Returns `null` when the record
 * carries no token (legacy / TSA was unreachable at issue-time) — an honest
 * "no independent timestamp", never a half-claim.
 */
function verifyRecordTimestamp(
  deps: VerifyDeps,
  record: CredentialRecord,
): { valid: boolean; genTime?: string; tsaSubject?: string } | null {
  const token = record.tsaTimestampToken;
  if (!token) return null;
  return deps.verifier.verifyTimestamp(token, b64ToBytes(record.mldsaSignature));
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
        "img-src 'none'",
        // Brand woff2 served same-origin from GET /fonts/:file; no CDN, offline-safe.
        "font-src 'self'",
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

  // ── Self-hosted brand fonts (in-memory, immutable, same-origin) ────────────
  // The design system's @font-face block references url(/fonts/<file>.woff2);
  // these bytes live in a compiled module so they ship in the pruned distroless
  // image with no filesystem or Dockerfile change. The map IS the allow-list:
  // anything not a known key 404s, so there is no path-traversal surface. Public
  // and uncacheable-by-nobody: content-stable per @fontsource version → immutable.
  app.get('/fonts/:file', (c) => {
    const file = c.req.param('file');
    if (!isFontFile(file)) {
      fail('NOT_FOUND', 'Unknown font.', 404);
    }
    const bytes = FONT_BYTES[file];
    if (!bytes) {
      fail('NOT_FOUND', 'Unknown font.', 404);
    }
    // Copy into a fresh, exact-length ArrayBuffer (same pattern as pdfResponse).
    const buf = bytes.slice().buffer;
    c.header('Content-Type', 'font/woff2');
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
    c.header('Content-Length', String(bytes.byteLength));
    return c.body(buf);
  });

  // ── Landing (bare domain): branded entry; `?id=…` redirects to /c/:id ──────
  app.get('/', (c) => {
    const id = c.req.query('id');
    if (id) {
      // Meet the typist halfway: IDs are canonically uppercase, but phones and
      // humans type lowercase. Uppercasing before validation cannot widen the
      // gate (the regex still decides) — it only stops a silent bounce-back.
      const parsed = credentialIdParamSchema.safeParse({ credentialId: id.trim().toUpperCase() });
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
    // Verify any RFC-3161 trusted timestamp server-side so the honest, conditional
    // "Independently timestamped …" line renders with JS off. Only a VERIFIED token
    // earns the line; an absent or non-verifying token claims nothing.
    const ts = verifyRecordTimestamp(deps, record);
    const html = renderCredentialPage({
      record,
      issuer: issuerName,
      issuerLegalName: env.ISSUER_LEGAL_NAME,
      verifyBaseUrl: env.VERIFY_PUBLIC_URL,
      nonce,
      verification: { outcome: deriveOutcome(checks), checks },
      // exactOptionalPropertyTypes: only include keys that are actually present,
      // never set an optional field to `undefined`.
      ...(ts && ts.valid
        ? {
            trustedTimestamp: {
              ...(ts.genTime !== undefined ? { genTime: ts.genTime } : {}),
              ...(ts.tsaSubject !== undefined ? { tsaSubject: ts.tsaSubject } : {}),
            },
          }
        : {}),
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
      // Accept JSON (enhanced fetch) OR urlencoded (the no-JS form POST). Either
      // way the password stays in the POST body — never a GET URL or query log.
      const ct = c.req.header('content-type') ?? '';
      const raw = ct.includes('application/json') ? await c.req.json() : await c.req.parseBody();
      const result = downloadSchema.safeParse(raw);
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

  // ── Court-ready, OFFLINE-verifiable evidence bundle (public, JSON download) ──
  // A self-contained "trust nobody" artifact: it carries the exact signed bytes,
  // the detached ML-DSA-87 signature + the issuer's PUBLIC key, the signed
  // transparency-log head + the log's PUBLIC key, the external anchor (or honest
  // null), the RFC-3161 trusted timestamp (verified), and a tool-named, offline
  // how-to so an opposing expert re-verifies EVERYTHING with no access to dmj.one.
  // Honest framing only — independently-verifiable forensic evidence, NOT a
  // licensed-CA Digital Signature Certificate and no statutory presumption.
  app.get('/api/credentials/:credentialId/evidence', async (c) => {
    const parsed = credentialIdParamSchema.safeParse({ credentialId: c.req.param('credentialId') });
    if (!parsed.success) {
      fail('VALIDATION_FAILED', 'Invalid credential id.', 400);
    }
    const record = await deps.credentialRepo.getById(parsed.data.credentialId);
    if (!record) {
      fail('CREDENTIAL_NOT_FOUND', 'No credential matches that id.', 404);
    }
    const bundle = await buildEvidenceBundle(deps, record, issuerName);
    // Self-contained download; never cached (it embeds the live head + anchor state).
    c.header('Content-Type', 'application/json; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${record.id}-evidence.json"`);
    c.header('Cache-Control', 'no-store');
    // Pretty-print: the bundle is meant to be opened and read by a human expert.
    return c.body(JSON.stringify(bundle, null, 2));
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
  // Recompute the signed bytes BY KIND (cert/letter/upload) and verify. For a
  // certificate record this is byte-identical to the frozen cert path.
  const mldsaSignature = deps.verifier.verifyMldsaForRecord(record);
  return {
    mldsaSignature,
    hashMatch: true,
    logInclusion,
    anchorProof,
    notRevoked: record.status === 'valid',
  };
}

/**
 * Assemble the SELF-CONTAINED, offline-verifiable evidence bundle for a record.
 *
 * "Trust nobody": every field an opposing expert needs to re-verify each check
 * with NO access to dmj.one is embedded — the exact signed content + its hashes,
 * the detached ML-DSA-87 signature + the issuer's PUBLIC key, the signed log head
 * + the log's PUBLIC key, the external anchor (or honest null), the RFC-3161
 * trusted timestamp (verified), and a tool-named offline how-to. The honest
 * framing in `disclaimer` is load-bearing and guarded by tests: this maximises
 * EVIDENTIARY WEIGHT; it is NOT a licensed-CA Digital Signature Certificate and
 * asserts NO statutory presumption.
 *
 * `externalAnchor` uses the SAME predicate as {@link checkAnchor} (latest proof,
 * `headSeq >= record.logSeq && github != null`) so the bundle and the page never
 * disagree about whether the record is externally anchored.
 */
async function buildEvidenceBundle(
  deps: VerifyDeps,
  record: CredentialRecord,
  issuer: string,
): Promise<Record<string, unknown>> {
  const [head, latestAnchor] = await Promise.all([
    deps.logRepo.getHead(),
    deps.anchorRepo.latest(),
  ]);
  // Honest external-anchor surface: the actual proof ONLY when it genuinely
  // covers this record AND was published to the public GitHub store; else null
  // ("pending"). Identical condition to checkAnchor → page and bundle agree.
  const externalAnchor =
    latestAnchor && latestAnchor.headSeq >= record.logSeq && latestAnchor.github != null
      ? latestAnchor
      : null;

  // RFC-3161 trusted timestamp, verified server-side over the RAW signature bytes.
  const ts = verifyRecordTimestamp(deps, record);
  const trustedTimestamp =
    record.tsaTimestampToken && ts
      ? {
          rfc3161TokenBase64: record.tsaTimestampToken,
          messageImprintNote:
            'the token was computed over the RAW ML-DSA signature bytes (base64-decode signature.valueBase64 before checking its messageImprint)',
          verified: ts,
        }
      : null;

  return {
    meta: {
      credentialId: record.id,
      kind: documentKind(record),
      status: record.status,
      // The human-facing issue date as authored and SIGNED into `content`
      // (every kind carries `issueDate`), not the §63 production timestamp.
      issuedDate: record.content.issueDate,
      generatedAt: new Date().toISOString(),
      issuer,
      verifyUrl: `${deps.env.VERIFY_PUBLIC_URL}/c/${record.id}`,
    },
    // The exact data that was signed (the canonical payload is derived from this).
    content: record.content,
    document: { pdfSha256: record.pdfSha256, hashAlgorithm: 'SHA-256' },
    canonical: {
      payload: record.canonicalPayload,
      sha256: record.canonicalSha256,
      note: 'the exact UTF-8 bytes the signature covers',
    },
    signature: {
      algorithm: 'ML-DSA-87 (NIST FIPS 204)',
      valueBase64: record.mldsaSignature,
      publicKeyBase64: deps.evidenceKeys.mldsaPublicKeyBase64,
      publicKeyId: record.mldsaPublicKeyId,
    },
    transparencyLog: {
      seq: record.logSeq,
      leafHash: record.logLeafHash,
      head,
      logPublicKeyBase64: deps.evidenceKeys.logMldsaPublicKeyBase64,
      note: 'leaf = SHA-256(canonicalSha256); head is ML-DSA-signed',
    },
    externalAnchor,
    trustedTimestamp,
    howToVerify: [
      'Confirm the canonical bytes: take canonical.payload (the exact UTF-8 string the signature covers) and check SHA-256(canonical.payload) equals canonical.sha256. The payload is deterministic JSON (recursively sorted keys, no insignificant whitespace) over the fields in `content` plus document.pdfSha256, so independently re-serialising `content` + document.pdfSha256 the same way reproduces canonical.payload byte-for-byte.',
      'Verify the ML-DSA-87 signature over those canonical bytes (the UTF-8 of canonical.payload) using signature.publicKeyBase64 — e.g. @noble/post-quantum ml_dsa87.verify(publicKey, utf8Bytes(canonical.payload), base64Decode(signature.valueBase64)), or any NIST FIPS 204 verifier.',
      trustedTimestamp
        ? 'Verify the RFC-3161 token (trustedTimestamp.rfc3161TokenBase64, base64 DER) with `openssl ts -verify` or an equivalent RFC-3161 library; confirm its messageImprint equals SHA-256 of the RAW signature bytes (base64-decode signature.valueBase64 first — the token covers the signature bytes, NOT the canonical payload), and read its genTime. Chain-validating the TSA certificate to a public root is the relying party’s own step.'
        : 'No independent RFC-3161 timestamp was obtained for this record (trustedTimestamp is null), so there is no timestamp step.',
      'Confirm the transparency-log leaf: leafHash equals SHA-256(canonical.sha256), then verify the head signature — ML-DSA-87 over transparencyLog.head.headHash, in transparencyLog.head.signature — using transparencyLog.logPublicKeyBase64. (Full Merkle audit-path proof is a relying-party step; this bundle pins leaf consistency under one signed head.)',
      'Confirm document.pdfSha256 equals the SHA-256 of the certificate file you are holding, so the bytes attested here are the bytes in your hand.',
    ],
    disclaimer:
      'This bundle is independently-verifiable forensic evidence: a self-signed cryptographic attestation by dmj.one, an independent educational initiative. It maximises evidentiary weight; it is NOT a licensed certifying-authority Digital Signature Certificate. ML-DSA-87 is a NIST FIPS 204 post-quantum algorithm but is NOT a CCA-recognized algorithm under Indian law, and no statutory presumption is asserted.' +
      (trustedTimestamp
        ? ''
        : ' No independent RFC-3161 timestamp was obtained for this record, so the time the signature existed is not independently corroborated here.'),
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
