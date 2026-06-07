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

/** Two-letter type codes embedded in the credential ID. */
export const CREDENTIAL_TYPE_CODES = {
  internship: 'IC',
  completion: 'CC',
  appreciation: 'AC',
  experience: 'EC',
  participation: 'PC',
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
