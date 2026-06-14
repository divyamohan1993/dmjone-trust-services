/**
 * Domain types shared across all packages and services.
 *
 * These describe the data at rest and the seams between streams. Treat them as
 * a frozen contract: changing a field here ripples through crypto, data,
 * render, issuer, and verify. Propose changes via the orchestrator.
 */

import type { CREDENTIAL_STATUS, VERIFICATION_OUTCOME, SERVICE_ROLE } from './constants.js';

export type CredentialStatus = (typeof CREDENTIAL_STATUS)[number];
export type VerificationOutcome = (typeof VERIFICATION_OUTCOME)[number];
export type ServiceRole = (typeof SERVICE_ROLE)[number];

/** The five preset certificate types (suggested values; offered in the UI). */
export type CredentialTypePreset =
  | 'internship'
  | 'completion'
  | 'appreciation'
  | 'experience'
  | 'participation';

/**
 * A certificate type. One of the presets, or any custom free-text type (Mode 1
 * "certificate of any type"). The `(string & {})` keeps preset autocomplete while
 * accepting arbitrary strings; the boundary schema (`issueCredentialTypeSchema`)
 * constrains the charset, and `labelForType`/`credentialTypeCode` handle display
 * + id-code derivation for custom values.
 */
export type CredentialType = CredentialTypePreset | (string & {});

/**
 * The trust backbone serves three document modes; `kind` discriminates them on
 * the stored record. A record with no `kind` is a certificate (see
 * {@link documentKind}), so existing certificate data reads unchanged.
 */
export type DocumentKind = 'certificate' | 'letter' | 'upload';

// ───────────────────────────── Certificate content ─────────────────────────

/** The fixed signatory block (the sole issuer). */
export interface Signatory {
  name: string;
  role: string;
  phone: string;
}

/**
 * Everything that appears on the certificate face. This is the human-authored
 * content; the renderer turns it into the pixel-faithful PDF and the verify
 * page shows the public subset.
 */
export interface CredentialContent {
  /** `DMJ-IC-20260604-01`. */
  credentialId: string;
  type: CredentialType;
  /** ISO-8601 date (YYYY-MM-DD). Displayed as e.g. "04 June 2026". */
  issueDate: string;
  /** Small caps line above the title, e.g. "Certificate of". */
  kicker: string;
  /** Big display title, e.g. "INTERNSHIP". */
  title: string;
  /** Italic intro, e.g. "This is to certify that". */
  intro: string;
  recipientName: string;
  /** Body paragraphs (justified). */
  bodyParagraphs: string[];
  /** Optional centered italic closing line. */
  closingLine?: string;
  signatory: Signatory;
}

// ──────────────────────────── Letterhead letter ────────────────────────────

/**
 * Letterhead letter content (rich body reuses the cert body markup grammar:
 * the `[[align:…]]` directive + ** /* /__ inline marks, compiled by
 * compileParagraph).
 */
export interface LetterContent {
  /** `DMJ-LTR-YYYYMMDD-NN`. */
  documentId: string;
  /** ISO-8601 date (YYYY-MM-DD). */
  issueDate: string;
  /** Optional "Ref:" line. */
  reference?: string;
  /** The "To" address block, 0..8 lines (each <=120 chars). */
  recipientLines: string[];
  /** Optional "Subject:" line. */
  subject?: string;
  /** "Dear Sir/Madam,". */
  salutation?: string;
  /** Rich body, 1..40 paragraphs (long letter; same markup as cert body). */
  bodyParagraphs: string[];
  /** "Sincerely,". */
  valediction?: string;
  /** Reuse DEFAULT_SIGNATORY. */
  signatory: Signatory;
}

// ──────────────────────────── Upload-&-attest ──────────────────────────────

/**
 * Where on ONE page of the uploaded PDF the handwritten signature image was
 * stamped. An {@link UploadAttestation} carries an array of these — one per
 * page the signature was placed on, each with its OWN position and size. All
 * coordinates are FRACTIONS of the page box (origin = top-left), so they are
 * resolution-independent; height is derived from the image aspect ratio.
 */
export interface SignaturePlacement {
  /** 1-based page index. */
  page: number;
  /** 0..1 left edge / page width. */
  xPct: number;
  /** 0..1 top edge / page height. */
  yPct: number;
  /** 0..1 signature width / page width. */
  wPct: number;
}

/** Attestation metadata for an uploaded-&-signed PDF (no rendered content). */
export interface UploadAttestation {
  /** `DMJ-DOC-YYYYMMDD-NN` (the visible "document number"). */
  documentId: string;
  /** ISO-8601 date (YYYY-MM-DD). */
  issueDate: string;
  /** Sanitized basename, <=200 chars. */
  originalFilename: string;
  /** Hex SHA-256 of the uploaded bytes BEFORE any stamping. */
  originalSha256: string;
  /** Pages in the uploaded PDF. */
  pageCount: number;
  /** Present (non-empty) iff the handwritten signature was stamped; one entry
   *  per page it was placed on, each with its own position AND size. */
  signaturePlacements?: SignaturePlacement[];
  signatory: Signatory;
}

// ──────────────────────────── Cryptographic record ─────────────────────────

/**
 * Result of hybrid-signing. The delivered PDF carries NO embedded signature
 * object — `signedPdf` is byte-identical to the rendered PDF (a self-signed PAdES
 * object was deliberately removed because browser viewers flagged it "Invalid
 * Signature"). The ML-DSA signature is DETACHED — stored in Firestore + the
 * transparency log, never written into the PDF, so {@link pdfSha256} stays stable
 * and upload-verify works. {@link padesCertFingerprint} is `''` in production
 * (the field is retained only for the dormant, test-only embedded-PAdES path).
 */
export interface HybridSignatureResult {
  /** The delivered PDF (NO embedded signature object). Final; never mutate it. */
  signedPdf: Uint8Array;
  /** SHA-256 of {@link signedPdf}, hex. */
  pdfSha256: string;
  /** Deterministic JSON that the ML-DSA signature covers. */
  canonicalPayload: string;
  /** SHA-256 of {@link canonicalPayload}, hex. */
  canonicalSha256: string;
  /** ML-DSA-87 detached signature, base64. */
  mldsaSignature: string;
  /** Key id / version of the ML-DSA public key used. */
  mldsaPublicKeyId: string;
  /** SHA-256 fingerprint of the PAdES signing certificate, hex. */
  padesCertFingerprint: string;
  /**
   * Base64 (DER) RFC-3161 TimeStampToken over the RAW ML-DSA signature bytes —
   * an independent third-party attestation of WHEN the signature existed, so it
   * cannot have been back-dated. Best-effort: ABSENT when no TSA is configured or
   * the TSA call failed (a TSA outage never blocks issuance). This is
   * independently-verifiable forensic evidence, not a statutory presumption.
   */
  tsaTimestampToken?: string;
}

/** BSA 2023 §63 certificate-of-authenticity metadata (Part A pre-filled). */
export interface Section63Metadata {
  hashValue: string;
  hashAlgorithm: 'SHA-256';
  /** System that produced the record. */
  producedBy: string;
  /** How it was produced. */
  productionMethod: string;
  /** Particulars of the device(s) involved. */
  deviceParticulars: string;
  generatedAt: string;
}

/**
 * The full stored record for one trusted document. The crypto block, status,
 * transparency-log linkage, gated download, and §63 metadata are SHARED across
 * all kinds; only `content` varies by `kind`.
 *
 * The name is kept (it predates the multi-kind generalization) to minimize
 * churn. `kind` is optional: an absent `kind` reads as `'certificate'` (see
 * {@link documentKind}), so records written before the generalization stay
 * valid unchanged.
 */
export interface CredentialRecord {
  id: string;
  /** Absent ⇒ `'certificate'`. */
  kind?: DocumentKind;
  content: CredentialContent | LetterContent | UploadAttestation;
  status: CredentialStatus;
  createdAt: string;
  revokedAt?: string;
  /**
   * Detached ML-DSA-87 signature over the domain-tagged status assertion
   * ({@link computeStatusAssertionPayload}) — makes the current status provable
   * and dated (an unsigned `status` flag cannot be proven to a court). Minted by
   * the ISSUER at issue-time and re-minted on every status change; `asOf` is the
   * status-change instant (`createdAt` for valid, `revokedAt` for revoked).
   * ABSENT on legacy records issued before signed status assertions existed —
   * such a record's status reads as `legacyUnsigned` (still admissible, just not
   * independently provable). Present iff it matches the CURRENT status.
   */
  statusSignature?: { value: string; asOf: string };
  // crypto
  pdfSha256: string;
  canonicalPayload: string;
  canonicalSha256: string;
  mldsaSignature: string;
  mldsaPublicKeyId: string;
  padesCertFingerprint: string;
  /** Persisted RFC-3161 timestamp over the raw ML-DSA signature (see
   *  {@link HybridSignatureResult.tsaTimestampToken}). Absent on legacy records
   *  and whenever no TSA was reachable at issue-time. */
  tsaTimestampToken?: string;
  // transparency log linkage
  logSeq: number;
  logLeafHash: string;
  // gated download
  passwordHash: string;
  // legal
  section63: Section63Metadata;
}

/**
 * The kind of a stored record, defaulting an absent `kind` to `'certificate'`
 * so pre-generalization records (which have no `kind` field) read correctly.
 * The single place this default is applied; use it instead of reading
 * `record.kind` directly.
 */
export function documentKind(record: Pick<CredentialRecord, 'kind'>): DocumentKind {
  return record.kind ?? 'certificate';
}

// ─────────────────────────── Transparency log ──────────────────────────────

/** One leaf in the append-only hash chain. */
export interface LogLeaf {
  seq: number;
  /** SHA-256(canonicalSha256), hex. */
  leafHash: string;
  credentialId: string;
  canonicalSha256: string;
  timestamp: string;
}

/** A signed tree head: the running chain digest, ML-DSA-signed. */
export interface SignedTreeHead {
  seq: number;
  /** SHA-256(leafHash ‖ prevHeadHash), hex. */
  headHash: string;
  prevHeadHash: string;
  /** ML-DSA-87 signature over headHash, base64. */
  signature: string;
  signedAt: string;
}

/** Proof that a signed head was published to an external immutable place. */
export interface AnchorProof {
  headSeq: number;
  headHash: string;
  github?: {
    repo: string;
    commitSha: string;
    url: string;
  };
  opentimestamps?: {
    otsBase64: string;
    status: 'pending' | 'confirmed';
  };
  anchoredAt: string;
}

// ───────────────────────────── Verification ────────────────────────────────

/** Individual checks that compose a verification outcome. */
export interface VerificationChecks {
  mldsaSignature: boolean;
  /** Only present when a PDF was supplied (file-upload flow). */
  padesSignature?: boolean;
  hashMatch: boolean;
  logInclusion: boolean;
  anchorProof: boolean;
  notRevoked: boolean;
}

/** Public, HR/legal-facing fields shown without a password. */
export interface PublicCredentialFields {
  recipientName: string;
  kicker: string;
  title: string;
  type: CredentialType;
  issueDate: string;
  issuer: string;
  status: CredentialStatus;
}

/** The full verification response. */
export interface VerificationResult {
  credentialId: string;
  outcome: VerificationOutcome;
  checks: VerificationChecks;
  publicFields?: PublicCredentialFields;
  verifiedAt: string;
}

// ──────────────────────────────── Admin auth ───────────────────────────────

export interface WebAuthnCredential {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  label: string;
  createdAt: string;
}

/** Admin account record (single admin in v1). Secrets are encrypted at rest. */
export interface AdminAccount {
  id: string;
  webauthnCredentials: WebAuthnCredential[];
  /** Encrypted TOTP secret. */
  totpSecretEnc?: string;
  /** Argon2id hashes of one-time recovery codes; consumed on use. */
  recoveryCodeHashes: string[];
  failureCount: number;
  lockedUntil?: string;
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────── Audit ────────────────────────────────────

export interface AuditEvent {
  id: string;
  at: string;
  actor: 'admin' | 'public' | 'system';
  action: string;
  /** Subject id (credentialId, etc.). */
  subject?: string;
  requestId?: string;
  /** Hash chained to the previous audit event for tamper-evidence. */
  prevHash: string;
  hash: string;
  meta?: Record<string, unknown>;
}
