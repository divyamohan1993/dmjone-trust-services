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

export type CredentialType =
  | 'internship'
  | 'completion'
  | 'appreciation'
  | 'experience'
  | 'participation';

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

// ──────────────────────────── Cryptographic record ─────────────────────────

/**
 * Result of hybrid-signing. The PAdES PKCS#7 object is embedded in
 * {@link signedPdf}; the ML-DSA signature is DETACHED — stored in Firestore +
 * the transparency log, never written into the PDF, so {@link pdfSha256} stays
 * stable and upload-verify works.
 */
export interface HybridSignatureResult {
  /** The PDF with the PAdES PKCS#7 object embedded. This is final; never mutate it. */
  signedPdf: Uint8Array;
  /** SHA-256 of {@link signedPdf}, hex. */
  pdfSha256: string;
  /** Deterministic JSON that the ML-DSA signature covers. */
  canonicalPayload: string;
  /** SHA-256 of {@link canonicalPayload}, hex. */
  canonicalSha256: string;
  /** ML-DSA-65 detached signature, base64. */
  mldsaSignature: string;
  /** Key id / version of the ML-DSA public key used. */
  mldsaPublicKeyId: string;
  /** SHA-256 fingerprint of the PAdES signing certificate, hex. */
  padesCertFingerprint: string;
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

/** The full stored record for one credential. */
export interface CredentialRecord {
  id: string;
  content: CredentialContent;
  status: CredentialStatus;
  createdAt: string;
  revokedAt?: string;
  // crypto
  pdfSha256: string;
  canonicalPayload: string;
  canonicalSha256: string;
  mldsaSignature: string;
  mldsaPublicKeyId: string;
  padesCertFingerprint: string;
  // transparency log linkage
  logSeq: number;
  logLeafHash: string;
  // gated download
  passwordHash: string;
  // legal
  section63: Section63Metadata;
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
  /** ML-DSA-65 signature over headHash, base64. */
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
