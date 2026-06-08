/**
 * Build the `CredentialContent` both the issuance pipeline and the preview route
 * render. Factored out of {@link issueCredential} so the two paths construct a
 * byte-identical object: same field order, same spread, same
 * `exactOptionalPropertyTypes` handling of `closingLine`. The ONLY difference is
 * the `credentialId` argument — a real allocated id at issue-time vs the fixed
 * `DMJ-PRV-…` placeholder for a side-effect-free preview.
 *
 * Pure: no I/O, no allocation, no signing, no persistence.
 */

import { DEFAULT_SIGNATORY } from '@dmjone/shared';
import type { CredentialContent } from '@dmjone/shared';

export type AssembleContentInput = {
  type: CredentialContent['type'];
  issueDate: string;
  kicker: string;
  title: string;
  intro: string;
  recipientName: string;
  bodyParagraphs: string[];
  // `string | undefined` (not just `string`): zod `.optional()` infers
  // `string | undefined` under exactOptionalPropertyTypes, so the mandated
  // `assembleContent(input, …)` call (§5.2/§5.3) typechecks from both issue.ts
  // and the preview route. The returned CredentialContent is unchanged — the
  // conditional spread below still OMITS the key when the value is undefined.
  closingLine?: string | undefined;
};

/**
 * The exact CredentialContent both issue and preview render. The ONLY difference
 * is the credentialId argument (real allocated id vs the 'DMJ-PRV-…' placeholder).
 */
export function assembleContent(
  input: AssembleContentInput,
  credentialId: string,
): CredentialContent {
  return {
    credentialId,
    type: input.type,
    issueDate: input.issueDate,
    kicker: input.kicker,
    title: input.title,
    intro: input.intro,
    recipientName: input.recipientName,
    bodyParagraphs: input.bodyParagraphs,
    signatory: { ...DEFAULT_SIGNATORY },
    ...(input.closingLine !== undefined && { closingLine: input.closingLine }),
  };
}
