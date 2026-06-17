/**
 * WS2-A true erasure (DPDP §8(7)): the SINGLE source of truth for which fields
 * an `erase(id)` purges, shared by the Firestore and in-memory credential repos
 * so the two cannot diverge.
 *
 * Erasure is DISTINCT from revocation: revocation keeps the content and marks the
 * document invalid; erasure blanks the recipient PII (per document kind) and the
 * plaintext `canonicalPayload`, then stamps `erased=true` / `erasedAt`.
 *
 * It is a blank-in-place, never a rebuild: only the named PII fields are touched,
 * so the non-PII crypto/log residue (id, pdfSha256, canonicalSha256,
 * mldsaSignature, mldsaPublicKeyId, padesCertFingerprint, logSeq, logLeafHash,
 * statusSignature, timestamps) AND the access/audit fields (`verifyToken`,
 * `issuerAttestation`) survive untouched. That residue lets the tombstone prove a
 * document existed and was erased, with zero PII, and keeps `/v/<verifyToken>`
 * resolving so the tombstone is reachable.
 *
 * What erasure does NOT do here:
 *   - It does NOT blank `section63` (a hash + machine facts, no recipient PII).
 *   - It does NOT purge the rendered certificate / section63 blobs; the CALLER
 *     wires that via {@link BlobStore.delete} (the repo holds no blob handle).
 *
 * The idempotency guard (skip if already erased) lives in the REPO, not here, so
 * a double-call is caught at the call site rather than masked. This function
 * always blanks-and-stamps the record it is given (callers pass a clone of the
 * stored record).
 */
import { documentKind, type CredentialRecord } from '@dmjone/shared';

/**
 * Blank the recipient PII for `record`'s kind, clear `canonicalPayload`, and
 * stamp the erasure marker. Mutates and returns the SAME object. Required PII
 * fields are set to the empty string / empty array unconditionally; optional
 * fields are blanked only when present, so the at-rest shape stays faithful (an
 * absent optional held no PII to purge).
 */
export function applyErasure(record: CredentialRecord, at: string): CredentialRecord {
  const kind = documentKind(record);

  if (kind === 'certificate') {
    const c = record.content as {
      kicker: string;
      title: string;
      intro: string;
      recipientName: string;
      bodyParagraphs: string[];
      closingLine?: string;
    };
    c.kicker = '';
    c.title = '';
    c.intro = '';
    c.recipientName = '';
    c.bodyParagraphs = [];
    if (c.closingLine !== undefined) c.closingLine = '';
  } else if (kind === 'letter') {
    const c = record.content as {
      recipientLines: string[];
      bodyParagraphs: string[];
      subject?: string;
      salutation?: string;
      valediction?: string;
      reference?: string;
    };
    c.recipientLines = [];
    c.bodyParagraphs = [];
    if (c.subject !== undefined) c.subject = '';
    if (c.salutation !== undefined) c.salutation = '';
    if (c.valediction !== undefined) c.valediction = '';
    if (c.reference !== undefined) c.reference = '';
  } else {
    // UploadAttestation: the only recipient PII is the original filename;
    // originalSha256 / pageCount are retained machine facts.
    const c = record.content as { originalFilename: string };
    c.originalFilename = '';
  }

  // The plaintext canonical payload contains the recipient name, so purge it too.
  record.canonicalPayload = '';
  record.erased = true;
  record.erasedAt = at;
  return record;
}
