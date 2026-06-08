/**
 * The single, authoritative definition of "what gets signed".
 *
 * Both the issuer (when producing the ML-DSA signature) and the verifier (when
 * checking it) MUST derive the signed bytes from this one function, so the
 * bytes are identical on both sides. Do not reimplement canonicalization
 * anywhere else.
 *
 * The payload is restricted to strings and string arrays, so deterministic
 * JSON (sorted keys, no whitespace, UTF-8) is unambiguous — no number- or
 * unicode-normalization corner cases.
 */

import type {
  CredentialContent,
  CredentialRecord,
  LetterContent,
  UploadAttestation,
} from './types.js';
import { documentKind } from './types.js';

/** Canonical JSON: recursively sorted keys, no insignificant whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

/** Current canonical-payload schema version. Bump only with a migration plan. */
export const CANONICAL_PAYLOAD_VERSION = 1;

/**
 * Build the exact UTF-8 string the ML-DSA signature covers.
 *
 * @param content   the certificate content (authored fields)
 * @param pdfSha256 hex SHA-256 of the FINAL delivered PDF bytes (no embedded signature)
 */
export function computeCanonicalPayload(content: CredentialContent, pdfSha256: string): string {
  const payload = {
    v: CANONICAL_PAYLOAD_VERSION,
    credentialId: content.credentialId,
    type: content.type,
    issueDate: content.issueDate,
    kicker: content.kicker,
    title: content.title,
    intro: content.intro,
    recipientName: content.recipientName,
    bodyParagraphs: content.bodyParagraphs,
    closingLine: content.closingLine ?? '',
    signatory: content.signatory,
    pdfSha256,
  };
  return canonicalJson(payload);
}

/** Canonical-payload schema version for letterhead letters. Bump only with a migration plan. */
export const LETTER_PAYLOAD_VERSION = 1;

/**
 * Build the exact UTF-8 string the ML-DSA signature covers for a letter.
 * Same `canonicalJson` and optional-normalization style as the certificate
 * branch; optional fields collapse to `''` so the signed bytes are unambiguous.
 *
 * @param c         the letter content (authored fields)
 * @param pdfSha256 hex SHA-256 of the FINAL delivered PDF bytes (no embedded signature)
 */
export function computeLetterCanonicalPayload(c: LetterContent, pdfSha256: string): string {
  return canonicalJson({
    v: LETTER_PAYLOAD_VERSION,
    kind: 'letter',
    documentId: c.documentId,
    issueDate: c.issueDate,
    reference: c.reference ?? '',
    recipientLines: c.recipientLines,
    subject: c.subject ?? '',
    salutation: c.salutation ?? '',
    bodyParagraphs: c.bodyParagraphs,
    valediction: c.valediction ?? '',
    signatory: c.signatory,
    pdfSha256,
  });
}

/** Canonical-payload schema version for upload-&-attest documents. Bump only with a migration plan. */
export const UPLOAD_PAYLOAD_VERSION = 1;

/**
 * Build the exact UTF-8 string the ML-DSA signature covers for an
 * uploaded-&-attested document. Absent signature placements collapse to `null`;
 * present placements are sorted by page (a copy, never mutating the input) so
 * the signed bytes are independent of the order the UI sent them — and the
 * verifier, sorting the same stored array, recomputes byte-identical bytes.
 * `canonicalJson` preserves array order, so this sort IS the determinism.
 *
 * @param a         the upload attestation metadata
 * @param pdfSha256 hex SHA-256 of the FINAL delivered PDF bytes (no embedded signature)
 */
export function computeUploadCanonicalPayload(a: UploadAttestation, pdfSha256: string): string {
  return canonicalJson({
    v: UPLOAD_PAYLOAD_VERSION,
    kind: 'upload',
    documentId: a.documentId,
    issueDate: a.issueDate,
    originalFilename: a.originalFilename,
    originalSha256: a.originalSha256,
    pageCount: a.pageCount,
    signaturePlacements: a.signaturePlacements
      ? [...a.signaturePlacements].sort((x, y) => x.page - y.page)
      : null,
    signatory: a.signatory,
    pdfSha256,
  });
}

/**
 * Dispatch to the right canonical-payload builder by record kind. Used by BOTH
 * the issuer (sign-time) and the verifier (recompute-time), so the bytes are
 * identical on both sides regardless of kind. For a certificate record (kind
 * absent or `'certificate'`) this is byte-for-byte identical to
 * {@link computeCanonicalPayload}, so existing certificates verify unchanged.
 */
export function computeCanonicalPayloadForRecord(record: CredentialRecord): string {
  switch (documentKind(record)) {
    case 'certificate':
      return computeCanonicalPayload(record.content as CredentialContent, record.pdfSha256);
    case 'letter':
      return computeLetterCanonicalPayload(record.content as LetterContent, record.pdfSha256);
    case 'upload':
      return computeUploadCanonicalPayload(record.content as UploadAttestation, record.pdfSha256);
  }
}
