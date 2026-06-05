/**
 * Cross-cutting constants shared by every package and service.
 * Single source of truth for algorithm identifiers, formats, and limits.
 */

/** Cryptographic algorithm identifiers (NIST names). */
export const ALGO = {
  /** Post-quantum signature: NIST FIPS 204, category 3. */
  MLDSA: 'ML-DSA-65',
  /** Content + chain hash. */
  HASH: 'SHA-256',
  /** Symmetric encryption for secrets at rest. */
  SYMMETRIC: 'AES-256-GCM',
  /** Password / recovery-code hashing. */
  KDF: 'Argon2id',
} as const;

/** Argon2id defaults (overridable via env). OWASP-aligned. */
export const ARGON2_DEFAULTS = {
  memoryKiB: 65536,
  iterations: 3,
  parallelism: 4,
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
