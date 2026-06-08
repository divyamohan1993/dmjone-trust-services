/**
 * Interfaces that define the seams between streams. Each stream implements the
 * interfaces it owns and consumes others' through these declarations only —
 * never through concrete imports. This is what lets the five streams build in
 * parallel without blocking on each other.
 */

import type {
  AdminAccount,
  AnchorProof,
  AuditEvent,
  CredentialContent,
  CredentialRecord,
  CredentialStatus,
  HybridSignatureResult,
  LogLeaf,
  Section63Metadata,
  SignedTreeHead,
} from './types.js';

// ───────────────────────────── Render (Stream E) ───────────────────────────

export interface RenderOptions {
  /** URL the QR code points to (the public credential page). */
  qrUrl: string;
}

export interface CertificateRenderer {
  /**
   * Render the pixel-faithful certificate to an UNSIGNED PDF.
   * Fonts and images are bundled (no network) so appearance is stable and
   * rendering works offline. Byte-for-byte reproducibility is NOT required:
   * nothing ever re-renders to verify. The hash that the ML-DSA signature
   * covers is taken over the persisted SIGNED bytes, never over a re-render.
   */
  render(content: CredentialContent, opts: RenderOptions): Promise<Uint8Array>;
}

// ───────────────────────────── Crypto (Stream A) ───────────────────────────

/** Decrypted signing material, loaded only inside the issuer service. */
export interface SigningKeys {
  padesCertPem: string;
  padesKeyPem: string;
  mldsaPublicKey: Uint8Array;
  mldsaSecretKey: Uint8Array;
  mldsaPublicKeyId: string;
}

/** Public verification material (safe for the keyless verify service). */
export interface VerifyingKeys {
  mldsaPublicKey: Uint8Array;
  mldsaPublicKeyId: string;
  logMldsaPublicKey: Uint8Array;
  padesCertPem: string;
}

/**
 * The hybrid signing pipeline. Implementations MUST follow this exact order;
 * any deviation breaks upload-verify or makes ML-DSA cover the wrong bytes:
 *
 *   1. (caller) render → unsignedPdf
 *   2. embed PAdES PKCS#7 placeholder + sign → signedPdf   (FINAL — never mutate after)
 *   3. pdfSha256     = SHA-256(signedPdf)
 *   4. canonical     = buildCanonicalPayload(pdfSha256)    (caller-supplied; e.g. computeCanonicalPayload(content, pdfSha256))
 *   5. mldsaSignature = ML-DSA-87.sign(UTF8(canonical))    (DETACHED — not written into the PDF)
 *   6. canonicalSha256 = SHA-256(UTF8(canonical))          (for the log leaf)
 *
 * The canonical payload binds `pdfSha256`, which only exists AFTER step 2, so
 * the signer cannot receive a precomputed string. The caller instead supplies a
 * `buildCanonicalPayload` callback that the signer invokes with the real
 * `pdfSha256` once it is known. This keeps the signer agnostic to document kind
 * (certificate / letter / upload all pass a different builder).
 */
export interface HybridSigner {
  sign(
    unsignedPdf: Uint8Array,
    buildCanonicalPayload: (pdfSha256: string) => string,
  ): Promise<HybridSignatureResult>;
}

export interface PadesVerifyResult {
  present: boolean;
  intact: boolean;
  certFingerprint?: string;
  signerSubject?: string;
}

export interface SignatureVerifier {
  /**
   * Verify the detached ML-DSA signature for a CERTIFICATE. Internally rebuilds
   * the signed bytes via the shared computeCanonicalPayload(content, pdfSha256)
   * — identical to issue-time — then checks the signature with the ML-DSA public
   * key. (Frozen certificate path; the bytes must not change.)
   */
  verifyMldsa(content: CredentialContent, pdfSha256: string, signatureB64: string): boolean;
  /**
   * Verify the detached ML-DSA signature for any stored record, recomputing the
   * signed bytes BY KIND via the shared computeCanonicalPayloadForRecord(record)
   * — so certificates, letters, and uploads all verify against the exact bytes
   * the issuer signed. For a certificate record (kind absent or 'certificate')
   * this is byte-identical to {@link verifyMldsa}. Never throws.
   */
  verifyMldsaForRecord(record: CredentialRecord): boolean;
  /** Verify the embedded PAdES PKCS#7 (only meaningful in the file-upload flow). */
  verifyPdfPades(signedPdf: Uint8Array): Promise<PadesVerifyResult>;
}

/** Pure hash-chain math (no I/O). Persistence lives in {@link LogRepository}. */
export interface LogHashing {
  computeLeafHash(canonicalSha256: string): string;
  computeHeadHash(leafHash: string, prevHeadHash: string): string;
}

/** Issuer-side: holds the log secret key. The keyless verify service never constructs this. */
export interface LogSigner extends LogHashing {
  /** ML-DSA-87 signature over the head hash, base64. */
  signHead(headHash: string): string;
}

/** Verify-side: public key only. */
export interface LogVerifier extends LogHashing {
  verifyHead(head: SignedTreeHead): boolean;
}

export interface AnchorPublisher {
  /** Publish a signed head to free external immutable stores. */
  publish(head: SignedTreeHead): Promise<AnchorProof>;
}

/**
 * Argon2id hashing for the candidate download password. Implemented by crypto
 * and injected into BOTH issuer (hash at issue-time) and verify (check at
 * download-time) so the encoding is guaranteed identical. `hash` returns a
 * self-describing PHC string (params embedded); `verify` is constant-time.
 */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
}

// ─────────────────────────────── Data (Stream D) ───────────────────────────

export interface CredentialRepository {
  create(record: CredentialRecord): Promise<void>;
  getById(id: string): Promise<CredentialRecord | null>;
  exists(id: string): Promise<boolean>;
  setStatus(id: string, status: CredentialStatus, at: string): Promise<void>;
  list(opts?: { limit?: number; cursor?: string }): Promise<{
    items: CredentialRecord[];
    nextCursor?: string;
  }>;
}

/** What a stored blob represents. A credential has up to two: the signed
 * certificate, and its §63 certificate-of-authenticity. */
export type BlobKind = 'certificate' | 'section63';

/** Chunked PDF storage (Firestore subcollection under the hood). */
export interface BlobStore {
  put(credentialId: string, kind: BlobKind, bytes: Uint8Array): Promise<void>;
  get(credentialId: string, kind: BlobKind): Promise<Uint8Array | null>;
}

export interface LogRepository {
  getHead(): Promise<SignedTreeHead | null>;
  /**
   * Append a leaf and advance the head inside a Firestore TRANSACTION with
   * optimistic concurrency on the current head (read head → write only if the
   * head is unchanged, else retry). Serialized appends are required for the
   * chain to be tamper-evident; concurrent appends must never interleave.
   */
  appendLeaf(leaf: LogLeaf, head: SignedTreeHead): Promise<void>;
  getLeaf(seq: number): Promise<LogLeaf | null>;
  getLeafByCredential(credentialId: string): Promise<LogLeaf | null>;
  listLeaves(fromSeq: number, toSeq: number): Promise<LogLeaf[]>;
}

export interface AnchorRepository {
  save(proof: AnchorProof): Promise<void>;
  latest(): Promise<AnchorProof | null>;
  forHead(headSeq: number): Promise<AnchorProof | null>;
}

export interface AdminRepository {
  get(): Promise<AdminAccount | null>;
  save(account: AdminAccount): Promise<void>;
}

export interface AuditLog {
  /**
   * Append a tamper-evident, hash-chained audit event inside a transaction
   * (serialized on the previous event's hash) — same concurrency rule as the
   * transparency log.
   */
  append(
    event: Omit<AuditEvent, 'id' | 'prevHash' | 'hash' | 'at'> & { at?: string },
  ): Promise<AuditEvent>;
  verify(): Promise<boolean>;
}

/** Secret Manager abstraction. Values are encrypted at rest by the caller. */
export interface SecretStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
}

// ─────────────────────────────── Legal (shared) ────────────────────────────

/**
 * §63 certificate-of-authenticity generator. Implemented by Stream E (reuses
 * the render infra), invoked by the issuer at issue-time; the resulting PDF is
 * stored and the keyless verify service merely serves the stored bytes.
 */
export interface Section63Generator {
  metadata(content: CredentialContent, pdfSha256: string): Section63Metadata;
  generate(record: CredentialRecord): Promise<Uint8Array>;
}
