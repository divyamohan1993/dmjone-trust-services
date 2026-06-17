/**
 * Build the `LetterContent` both the letter issuance pipeline and the letter
 * preview route render. Factored out (mirrors {@link assembleContent} for
 * certificates) so the two paths construct a byte-identical object: same field
 * order, same conditional spread, same `exactOptionalPropertyTypes` handling of
 * the optional lines. The ONLY difference is the `documentId` argument — a real
 * allocated `DMJ-LTR-…` at issue-time vs the fixed `DMJ-LTR-00000000-00`
 * placeholder for a side-effect-free preview.
 *
 * The same object reference is handed BOTH to `renderer.renderLetter` AND to
 * `signer.sign`'s canonical-payload builder AND to `credentialRepo.create`'s
 * `content`, so the bytes the verify side recomputes match the bytes signed.
 *
 * Pure: no I/O, no allocation, no signing, no persistence.
 */

import { DEFAULT_SIGNATORY } from '@dmjone/shared';
import type { IssueLetterInput, LetterContent } from '@dmjone/shared';

/**
 * The exact `LetterContent` both issue and preview render. The optional fields
 * are conditionally spread (omitted, not set to `undefined`) so the shape
 * matches the canonical signing payload's `?? ''` normalization and so the
 * object typechecks under `exactOptionalPropertyTypes`.
 */
export function assembleLetterContent(
  input: Omit<IssueLetterInput, 'password' | 'attestation' | 'scope'>,
  documentId: string,
): LetterContent {
  return {
    documentId,
    issueDate: input.issueDate,
    ...(input.reference !== undefined && { reference: input.reference }),
    recipientLines: input.recipientLines,
    ...(input.subject !== undefined && { subject: input.subject }),
    ...(input.salutation !== undefined && { salutation: input.salutation }),
    bodyParagraphs: input.bodyParagraphs,
    ...(input.valediction !== undefined && { valediction: input.valediction }),
    signatory: { ...DEFAULT_SIGNATORY },
  };
}
