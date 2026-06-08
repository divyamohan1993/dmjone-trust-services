/**
 * Cross-cutting constants shared by every package and service.
 * Single source of truth for algorithm identifiers, formats, and limits.
 */

/** Cryptographic algorithm identifiers (NIST names). */
export const ALGO = {
  /** Post-quantum signature: NIST FIPS 204, category 3. */
  MLDSA: 'ML-DSA-87',
  /** Content + chain hash. */
  HASH: 'SHA-256',
  /** Symmetric encryption for secrets at rest. */
  SYMMETRIC: 'AES-256-GCM',
  /** Password / recovery-code hashing. */
  KDF: 'Argon2id',
} as const;

/**
 * Argon2id defaults tuned for the PURE-JS implementation we run (@noble/hashes).
 * The OWASP m=19456 (19 MiB), t=2, p=1 profile is ~1.3 s/derivation in pure JS
 * and remains OWASP-compliant. The heavier native-calibrated profile
 * (m=65536, t=3, p=4) costs ~4.5 s in JS — bad UX and a CPU-exhaustion DoS
 * surface. p=1 because @noble Argon2id is single-threaded (parallelism > 1 only
 * adds cost without the parallel speedup).
 */
export const ARGON2_DEFAULTS = {
  memoryKiB: 19456,
  iterations: 2,
  parallelism: 1,
} as const;

/**
 * Credential ID format: `DMJ-<TYPE>-<YYYYMMDD>-<NN>`.
 * Example: `DMJ-IC-20260604-01` (IC = Internship Certificate).
 */
export const CREDENTIAL_ID_REGEX = /^DMJ-[A-Z]{2,4}-\d{8}-\d{2}$/;

/** Two-letter type codes embedded in the credential ID (certificates). */
export const CREDENTIAL_TYPE_CODES = {
  internship: 'IC',
  completion: 'CC',
  appreciation: 'AC',
  experience: 'EC',
  participation: 'PC',
} as const;

/** The five preset certificate types (suggested values; custom types are allowed). */
export const CREDENTIAL_TYPE_PRESETS = Object.keys(CREDENTIAL_TYPE_CODES) as Array<
  keyof typeof CREDENTIAL_TYPE_CODES
>;

/**
 * Human display labels for the preset certificate types. Each preset label is
 * exactly {@link titleCase} of its key, so an unknown/custom type's Title-Cased
 * label (see {@link labelForType}) reads identically in style — the verify page
 * and §63 can therefore use a single `labelForType` everywhere.
 */
export const CREDENTIAL_TYPE_LABELS = {
  internship: 'Internship',
  completion: 'Completion',
  appreciation: 'Appreciation',
  experience: 'Experience',
  participation: 'Participation',
} as const;

/** A 2–4 letter uppercase fallback code for a custom type with no clean derivation. */
const CUSTOM_TYPE_FALLBACK_CODE = 'CRT';

/**
 * The 2–4 uppercase-letter ID code for a certificate `type` (the `<CODE>` in
 * `DMJ-<CODE>-YYYYMMDD-NN`).
 *
 * - A preset type keeps its EXACT existing code ({@link CREDENTIAL_TYPE_CODES}),
 *   so every already-issued certificate id/sequence is unaffected. The preset
 *   lookup happens FIRST, so a string that equals a preset can never get a
 *   derived code.
 * - A custom type derives the first up-to-4 `[A-Z]` of its uppercased form.
 *   `CREDENTIAL_ID_REGEX` requires `[A-Z]{2,4}`, so if fewer than two letters
 *   survive (e.g. the schema-valid `"a1"`, `"x-9"`), we fall back to
 *   {@link CUSTOM_TYPE_FALLBACK_CODE} (`CRT`) to keep the assembled id valid.
 *
 * The result always matches `[A-Z]{2,4}`; callers assemble it into an id that
 * `allocateCredentialId` re-validates against `CREDENTIAL_ID_REGEX`.
 */
export function credentialTypeCode(type: string): string {
  const preset = (CREDENTIAL_TYPE_CODES as Record<string, string>)[type];
  if (preset) return preset;
  const letters = type.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  return letters.length >= 2 ? letters : CUSTOM_TYPE_FALLBACK_CODE;
}

/**
 * Title-Case a display string: lowercase, then upper-case the first letter of
 * each word, where words are split on whitespace OR hyphens (hyphens are a legal
 * custom-type character, and a hyphen-joined compound reads better fully capped:
 * `"hall-of-fame entry"` → `"Hall-Of-Fame Entry"`). Locale-independent and
 * side-effect-free. `"award of merit"` → `"Award Of Merit"`.
 */
export function titleCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/(^|[\s-])([^\s-])/g, (_m, lead: string, ch: string) => lead + ch.toUpperCase());
}

/**
 * The human display label for a certificate `type`: a preset keeps its fixed
 * label ({@link CREDENTIAL_TYPE_LABELS}); a custom/unknown type is Title-Cased.
 * Because each preset label equals `titleCase(key)`, this is a safe drop-in for
 * any `TYPE_LABEL[type]` lookup (verify page, §63).
 */
export function labelForType(type: string): string {
  return (CREDENTIAL_TYPE_LABELS as Record<string, string>)[type] ?? titleCase(type);
}

/**
 * Document-ID prefixes for the non-certificate kinds. They share the same
 * `DMJ-<CODE>-YYYYMMDD-NN` shape (and the same per-day sequence counter) as
 * certificates; `CREDENTIAL_ID_REGEX` already matches these 3-letter codes.
 */
export const DOCUMENT_ID_PREFIX = {
  letter: 'LTR',
  upload: 'DOC',
} as const;

/** Firestore single-document limit is 1 MiB; chunk well under it. */
export const PDF_CHUNK_SIZE_BYTES = 256 * 1024;

/**
 * `prevHeadHash` for the first entry of a hash chain (empty chain / no
 * predecessor). Used by both the transparency log and the audit log. The first
 * real leaf is seq 1.
 */
export const GENESIS_HEAD_HASH = '0'.repeat(64);

/** Number of one-time recovery codes generated at admin setup. */
export const RECOVERY_CODE_COUNT = 12;

/** Credential lifecycle states. */
export const CREDENTIAL_STATUS = ['valid', 'revoked'] as const;

/** Verification outcomes surfaced to callers. */
export const VERIFICATION_OUTCOME = ['valid', 'tampered', 'unknown', 'revoked'] as const;

/** Service roles a process can run as. */
export const SERVICE_ROLE = ['issuer', 'verify'] as const;

/** Default region. */
export const DEFAULT_REGION = 'asia-east1';

/** Fixed signatory (the sole issuer). Stored per-credential for the record. */
export const DEFAULT_SIGNATORY = {
  name: 'Divya Mohan',
  role: 'Founder · dmj.one',
  phone: '+91 79799 30293',
} as const;
