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

import type { CredentialContent } from './types.js';

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
 * @param pdfSha256 hex SHA-256 of the FINAL signed PDF bytes (after PAdES)
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
