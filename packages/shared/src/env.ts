/**
 * Validated environment. Parsed once at startup; the process crashes on
 * misconfiguration rather than running in an undefined state.
 */

import { z } from 'zod';

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  SERVICE_ROLE: z.enum(['issuer', 'verify']),
  /** `firestore` (prod) or `memory` (local dev / smoke — no GCP needed). */
  DATA_BACKEND: z.enum(['memory', 'firestore']).default('firestore'),
  PORT: z.coerce.number().int().positive().default(8080),

  GCP_PROJECT_ID: z.string().min(1),
  GCP_REGION: z.string().default('asia-east1'),
  FIRESTORE_DATABASE_ID: z.string().default('(default)'),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),

  ISSUER_PUBLIC_URL: z.string().url(),
  VERIFY_PUBLIC_URL: z.string().url(),

  TRUST_SERVICE_NAME: z.string().default('dmj.one Trust Services'),
  TRUST_SERVICE_OU: z.string().default('Document Signing'),
  TRUST_SERVICE_COUNTRY: z.string().length(2).default('IN'),
  ISSUER_LEGAL_NAME: z.string().default('dmj.one (independent educational initiative)'),
  ISSUER_CONTACT_EMAIL: z.string().email().default('contact@dmj.one'),
  ISSUER_CONTACT_PHONE: z.string().default('+91 79799 30293'),

  MASTER_ENCRYPTION_KEY: z.string().optional(),
  // Argon2id (pure-JS, runs in the distroless verify image): 32 MiB / t=3 is a
  // research-grade bump over the OWASP-min 19 MiB/t=2 that stays within the
  // download endpoint's latency + memory budget. 64 MiB pure-JS is too slow.
  ARGON2_MEMORY_KIB: z.coerce.number().int().positive().default(32768),
  ARGON2_ITERATIONS: z.coerce.number().int().positive().default(3),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().default(1),
  SESSION_SECRET: z.string().min(16),
  ADMIN_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  MAX_AUTH_FAILURES: z.coerce.number().int().positive().default(10),

  ANCHOR_GITHUB_REPO: z.string().optional(),
  ANCHOR_GITHUB_TOKEN: z.string().optional(),
  ANCHOR_OPENTIMESTAMPS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  ANCHOR_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  ADMIN_TELEGRAM_CHAT_ID: z.string().optional(),
  SMTP_URL: z.string().optional(),
});

/** Issuer-only variables (WebAuthn relying party, Chromium). */
const issuerEnvSchema = z.object({
  WEBAUTHN_RP_ID: z.string().min(1),
  WEBAUTHN_RP_NAME: z.string().min(1),
  WEBAUTHN_ORIGIN: z.string().url(),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
  /**
   * Gates the FIRST admin passkey registration (and re-registration after a
   * factory reset / empty restore — the zero-passkey window). Must be its OWN
   * secret; never reuse SESSION_SECRET or MASTER_ENCRYPTION_KEY. The issuer
   * refuses bootstrap in production when this is unset (fail-closed).
   */
  ADMIN_SETUP_TOKEN: z.string().min(16).optional(),
  /**
   * RFC-3161 Time-Stamping Authority endpoint. When set, issuance obtains a
   * trusted timestamp over the raw ML-DSA signature and stores it on the record
   * (nothing is embedded in the delivered PDF — the bytes stay byte-identical to
   * the render). Best-effort at sign time; unset = no timestamp (the
   * transparency log + anchor remain the primary trusted timestamp).
   *
   * IMPORTANT: the token verifier (verifyTimestampToken) supports RSA TSAs with
   * a SHA-2 signing digest only. VERIFIED-GOOD against live tokens:
   *   - http://timestamp.digicert.com  (RSA / SHA-256)  ← recommended default
   *   - http://timestamp.sectigo.com   (RSA / SHA-384)
   * NOT yet verifiable: TSAs that sign with ECDSA — notably FreeTSA
   * (ecdsa-with-SHA512) — whose tokens would be stored but verify as invalid.
   * Point TSA_URL at an RSA TSA above; do NOT use FreeTSA until ECDSA token
   * verification is added.
   */
  TSA_URL: z.string().url().optional(),
  /**
   * The dmj.one handwritten-signature PNG as base64, mounted from the Secret
   * Manager secret `signature-png`. The real signature is NEVER committed to the
   * repo (the public GitHub mirror would leak it); unset (local/test) falls back
   * to the bundled non-personal "Specimen" placeholder. Consumed by @dmjone/render.
   */
  SIGNATURE_PNG_BASE64: z.string().optional(),
  /**
   * The AES-256-GCM-sealed signing-key blob (`trust_private`) as base64, injected
   * from a CI secret into the Cloud Run container instead of Secret Manager. Read
   * by provisionIssuerKeys (env first, then the SecretStore). Sealed + useless
   * without MASTER_ENCRYPTION_KEY, which stays in Secret Manager.
   */
  TRUST_PRIVATE_B64: z.string().optional(),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
export type IssuerEnv = z.infer<typeof issuerEnvSchema>;
export type AppEnv = BaseEnv & Partial<IssuerEnv>;

/** Parse + validate. Throws a readable error listing every invalid var. */
export function loadEnv(raw: NodeJS.ProcessEnv = process.env): AppEnv {
  const base = baseEnvSchema.safeParse(raw);
  if (!base.success) {
    throw new Error(formatIssues('Invalid environment', base.error));
  }
  if (base.data.SERVICE_ROLE === 'issuer') {
    const issuer = issuerEnvSchema.safeParse(raw);
    if (!issuer.success) {
      throw new Error(formatIssues('Invalid issuer environment', issuer.error));
    }
    return { ...base.data, ...issuer.data };
  }
  return base.data;
}

function formatIssues(prefix: string, err: z.ZodError): string {
  const lines = err.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
  return `${prefix}:\n${lines.join('\n')}`;
}
