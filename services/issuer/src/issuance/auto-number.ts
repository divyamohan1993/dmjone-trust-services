/**
 * `[auto]` document-number substitution (WS1, design §`[auto]`).
 *
 * The picker lets the issuer drop a reserved `[auto]` token wherever the real
 * document number should appear; they never type the number. After the server
 * allocates the id, this helper replaces every `[auto]` with that id in the
 * issuer-authored text fields, BEFORE the content is rendered, signed, and
 * persisted — so the printed face number always equals the record id, and the
 * one signed `content` reference already carries the substituted text (the
 * verify side recomputes canonical bytes from the stored content, so the
 * substitution MUST happen before signing).
 *
 * Substituting `[auto]` is final issuer-authored prose: it legitimately changes
 * the canonical payload of THIS document. Records that never used `[auto]` are
 * untouched, so no existing signature is affected. This is unrelated to the
 * frozen-canonical rule, which is only about `verifyToken` / `issuerAttestation`
 * (record-level fields, never part of `content`).
 *
 * The reserved token is treated as already-resolved by the issue-time
 * unfilled-slot check (`content-guards.ts:findUnfilledSlot`), so an `[auto]`
 * passes the boundary and reaches here unstripped.
 *
 * Pure: returns a fresh object; never mutates the input. The recipient's NAME
 * (cert) and the addressee LINES (letter) are exempt — a person/addressee is
 * never the document number — mirroring the slot-check field set.
 */

import type { CredentialContent, LetterContent } from '@dmjone/shared';

/** The reserved token, replaced globally with the allocated id. */
const AUTO_TOKEN = /\[auto\]/g;

/** Replace every `[auto]` in `text` with `id`. */
function fill(text: string, id: string): string {
  return text.replace(AUTO_TOKEN, id);
}

/**
 * Substitute `[auto]` → `id` across a certificate's authored text fields
 * (`kicker`, `title`, `intro`, `bodyParagraphs`, and `closingLine` when
 * present). `recipientName` is left verbatim. Non-text fields
 * (`credentialId`, `type`, `issueDate`, `signatory`) are carried through
 * unchanged. Returns a fresh object (same field order/spread as
 * {@link assembleContent}).
 */
export function substituteAutoNumber(
  content: CredentialContent,
  id: string,
): CredentialContent {
  return {
    credentialId: content.credentialId,
    type: content.type,
    issueDate: content.issueDate,
    kicker: fill(content.kicker, id),
    title: fill(content.title, id),
    intro: fill(content.intro, id),
    recipientName: content.recipientName,
    bodyParagraphs: content.bodyParagraphs.map((p) => fill(p, id)),
    signatory: content.signatory,
    ...(content.closingLine !== undefined && { closingLine: fill(content.closingLine, id) }),
  };
}

/**
 * Substitute `[auto]` → `id` across a letter's authored text fields
 * (`reference`, `subject`, `salutation`, `bodyParagraphs`, `valediction` —
 * each only when present). `recipientLines` (the addressee) is left verbatim.
 * Optional fields absent on the input stay absent (never synthesised). Returns
 * a fresh object (same field order/spread as {@link assembleLetterContent}).
 */
export function substituteAutoNumberLetter(
  content: LetterContent,
  id: string,
): LetterContent {
  return {
    documentId: content.documentId,
    issueDate: content.issueDate,
    ...(content.reference !== undefined && { reference: fill(content.reference, id) }),
    recipientLines: content.recipientLines,
    ...(content.subject !== undefined && { subject: fill(content.subject, id) }),
    ...(content.salutation !== undefined && { salutation: fill(content.salutation, id) }),
    bodyParagraphs: content.bodyParagraphs.map((p) => fill(p, id)),
    ...(content.valediction !== undefined && { valediction: fill(content.valediction, id) }),
    signatory: content.signatory,
  };
}
