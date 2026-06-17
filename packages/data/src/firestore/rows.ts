/**
 * At-rest document shapes ("rows") and the conversions between them and the
 * @dmjone/shared domain types.
 *
 * Why explicit rows instead of writing domain objects directly:
 *   1. Firestore stores plain JSON only — binary PDF chunks become base64.
 *   2. The conversions are the ONE place optional fields are added/omitted, so
 *      read-back never produces `key: undefined` (which exactOptionalPropertyTypes
 *      forbids) and writes never emit `undefined` (which Firestore rejects).
 *   3. They keep the Firestore impl byte-for-byte faithful to the in-memory one.
 *
 * Every row is a plain object assignable to Firestore's DocumentData.
 */

import type {
  AdminAccount,
  AnchorProof,
  AuditEvent,
  CredentialRecord,
  LogLeaf,
  SignedTreeHead,
} from '@dmjone/shared';

// ── Credential ──────────────────────────────────────────────────────────────
// The credential record is already plain JSON (no binary), so the row IS the
// record. PDF bytes are NOT part of it — they live in the per-kind blob
// subcollections (cert_chunks / s63_chunks).
export type CredentialRow = CredentialRecord;

export function credentialToRow(record: CredentialRecord): CredentialRow {
  // Spread is sufficient; ignoreUndefinedProperties drops an absent revokedAt.
  return { ...record };
}

export function rowToCredential(row: CredentialRow): CredentialRecord {
  const out: CredentialRecord = {
    id: row.id,
    content: row.content,
    status: row.status,
    createdAt: row.createdAt,
    pdfSha256: row.pdfSha256,
    canonicalPayload: row.canonicalPayload,
    canonicalSha256: row.canonicalSha256,
    mldsaSignature: row.mldsaSignature,
    mldsaPublicKeyId: row.mldsaPublicKeyId,
    padesCertFingerprint: row.padesCertFingerprint,
    logSeq: row.logSeq,
    logLeafHash: row.logLeafHash,
    passwordHash: row.passwordHash,
    section63: row.section63,
  };
  // The `kind` discriminator MUST survive read-back: without it documentKind()
  // defaults every letter/upload to 'certificate', which mis-renders the verify
  // page (cert fields are absent → throws) and recomputes the canonical payload
  // on the wrong branch (ML-DSA fails → "unknown"). Stored by the spread in
  // credentialToRow; restored here. Absent ⇒ legacy certificate (correct default).
  if (row.kind !== undefined) out.kind = row.kind;
  if (row.revokedAt !== undefined) out.revokedAt = row.revokedAt;
  // Optional RFC-3161 timestamp: carried at-rest by the credentialToRow spread,
  // dropped by ignoreUndefinedProperties when absent, and restored here only
  // when present (omit-on-absent, like an absent revokedAt — never `= undefined`
  // under exactOptionalPropertyTypes). Absent on legacy records, which is fine.
  if (row.tsaTimestampToken !== undefined) out.tsaTimestampToken = row.tsaTimestampToken;
  // Signed status assertion: carried at-rest by the credentialToRow spread,
  // dropped by ignoreUndefinedProperties when absent, restored here only when
  // present (omit-on-absent, like revokedAt/tsaTimestampToken). Absent on legacy
  // records → the status endpoint reports `legacyUnsigned`.
  if (row.statusSignature !== undefined) out.statusSignature = row.statusSignature;
  // WS2 fields (all top-level; never in the canonical payload or /evidence;
  // absent on legacy pre-WS2 records). Same omit-on-absent pattern: carried at
  // rest by the credentialToRow spread, restored here only when present so
  // read-back never produces `key: undefined` under exactOptionalPropertyTypes.
  //   - verifyToken: the unguessable retrieval token (new issuance only).
  //   - issuerAttestation: the issuer's good-faith log entry.
  //   - erased/erasedAt: the true-erasure tombstone marker. This is also what
  //     makes rowToCredential tolerate a redacted record — it copies the (blanked)
  //     content through verbatim and asserts nothing about PII being populated.
  if (row.verifyToken !== undefined) out.verifyToken = row.verifyToken;
  if (row.issuerAttestation !== undefined) out.issuerAttestation = row.issuerAttestation;
  if (row.erased !== undefined) out.erased = row.erased;
  if (row.erasedAt !== undefined) out.erasedAt = row.erasedAt;
  return out;
}

// ── PDF chunk ───────────────────────────────────────────────────────────────
// The blob kind is encoded by the subcollection name (cert_chunks / s63_chunks),
// so it is NOT a field on the chunk doc.
export interface PdfChunkRow {
  /** Numeric chunk index for deterministic ordering (NOT doc-id lexical order). */
  n: number;
  /** base64 of this chunk's raw bytes. */
  data: string;
}

// ── Log leaf ────────────────────────────────────────────────────────────────
export type LogLeafRow = LogLeaf; // all string/number fields, plain JSON

export function rowToLeaf(row: LogLeafRow): LogLeaf {
  return {
    seq: row.seq,
    leafHash: row.leafHash,
    credentialId: row.credentialId,
    canonicalSha256: row.canonicalSha256,
    timestamp: row.timestamp,
  };
}

// ── Signed tree head ────────────────────────────────────────────────────────
export type SignedTreeHeadRow = SignedTreeHead; // plain JSON

export function rowToHead(row: SignedTreeHeadRow): SignedTreeHead {
  return {
    seq: row.seq,
    headHash: row.headHash,
    prevHeadHash: row.prevHeadHash,
    signature: row.signature,
    signedAt: row.signedAt,
  };
}

// ── Anchor proof ────────────────────────────────────────────────────────────
export type AnchorProofRow = AnchorProof; // nested optionals handled on read

export function rowToAnchor(row: AnchorProofRow): AnchorProof {
  const out: AnchorProof = {
    headSeq: row.headSeq,
    headHash: row.headHash,
    anchoredAt: row.anchoredAt,
  };
  if (row.github !== undefined) out.github = row.github;
  if (row.opentimestamps !== undefined) out.opentimestamps = row.opentimestamps;
  return out;
}

// ── Admin account ───────────────────────────────────────────────────────────
export type AdminAccountRow = AdminAccount;

export function rowToAdmin(row: AdminAccountRow): AdminAccount {
  const out: AdminAccount = {
    id: row.id,
    webauthnCredentials: row.webauthnCredentials.map((c) => {
      const cred = {
        credentialId: c.credentialId,
        publicKey: c.publicKey,
        counter: c.counter,
        label: c.label,
        createdAt: c.createdAt,
      } as AdminAccount['webauthnCredentials'][number];
      if (c.transports !== undefined) cred.transports = c.transports;
      return cred;
    }),
    recoveryCodeHashes: row.recoveryCodeHashes,
    failureCount: row.failureCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.totpSecretEnc !== undefined) out.totpSecretEnc = row.totpSecretEnc;
  if (row.lockedUntil !== undefined) out.lockedUntil = row.lockedUntil;
  return out;
}

// ── Audit event ─────────────────────────────────────────────────────────────
// At rest an audit doc also carries a numeric `seq` field, used only for
// deterministic ordering (it is NOT part of the hashed event payload — the
// chain hash covers exactly the AuditEvent fields).
export type AuditEventRow = AuditEvent & { seq: number };

export function rowToAudit(row: AuditEventRow): AuditEvent {
  const out: AuditEvent = {
    id: row.id,
    at: row.at,
    actor: row.actor,
    action: row.action,
    prevHash: row.prevHash,
    hash: row.hash,
  };
  if (row.subject !== undefined) out.subject = row.subject;
  if (row.requestId !== undefined) out.requestId = row.requestId;
  if (row.meta !== undefined) out.meta = row.meta;
  return out;
}
