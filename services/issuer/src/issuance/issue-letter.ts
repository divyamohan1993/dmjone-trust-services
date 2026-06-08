/**
 * The letterhead-letter issuance pipeline (Mode 2, spec §B.3).
 *
 * Byte-for-byte the same ordering and guarantees as the certificate pipeline
 * ({@link issueCredential}); only three things differ: the id prefix
 * (`DMJ-LTR`), the render path (`renderer.renderLetter`), and the canonical
 * payload (`computeLetterCanonicalPayload`). The primary signed PDF reuses the
 * `'certificate'` blob kind (the contract names it that for the signed document
 * regardless of kind).
 *
 *   1. allocate document id (DMJ-LTR-<YYYYMMDD>-<NN>)
 *   2. assemble LetterContent (signatory = DEFAULT_SIGNATORY)
 *   3. renderer.renderLetter(content) → unsignedPdf
 *   4. signer.sign(unsignedPdf, (h) => computeLetterCanonicalPayload(content, h))
 *   5. §63 Part-A metadata over the signed pdf hash
 *   6. append leaf to transparency log (with LOG_CONFLICT retry)
 *   7. hash the candidate password (Argon2id)
 *   8. credentialRepo.create({ ...record, kind:'letter', content })
 *   9. blobStore.put(certificate) then section63.generate(record) → put(section63)
 *  10. best-effort external anchor (never blocks issuance)
 *  11. audit the issuance
 */

import {
  computeLetterCanonicalPayload,
  DOCUMENT_ID_PREFIX,
  type CredentialContent,
  type CredentialRecord,
  type IssueLetterInput,
  type LetterContent,
} from '@dmjone/shared';

import type { IssuerDeps } from '../deps.js';
import { assembleLetterContent } from './assemble-letter-content.js';
import { allocateCredentialId } from './credential-id.js';
import { appendToLog } from './log-append.js';

export interface IssueLetterOutcome {
  documentId: string;
  logSeq: number;
}

/**
 * Run the full letter issuance pipeline for one validated request. Returns the
 * new document id (and log sequence). Throws an {@link AppError} on any fatal
 * step; the external anchor is best-effort.
 */
export async function issueLetter(
  deps: IssuerDeps,
  input: IssueLetterInput,
  ctx: { requestId: string; actor: string },
): Promise<IssueLetterOutcome> {
  const now = new Date().toISOString();

  // 1. Allocate a unique DMJ-LTR id for the issue date (shares the per-day
  //    sequence space with every other kind).
  const documentId = await allocateCredentialId(
    deps.credentialRepo,
    DOCUMENT_ID_PREFIX.letter,
    input.issueDate,
  );

  // 2. Build the letter content ONCE; this exact reference is what we render,
  //    sign over, and persist — so the verify-side recompute matches the bytes.
  const content: LetterContent = assembleLetterContent(input, documentId);

  const qrUrl = `${deps.env.VERIFY_PUBLIC_URL}/c/${documentId}`;

  // 3. Render the flowing, multi-page letterhead UNSIGNED pdf.
  const unsignedPdf = await deps.renderer.renderLetter(content, { qrUrl });

  // 4. Hybrid-sign: PAdES embedded + detached ML-DSA over the letter canonical
  //    payload. The signer supplies pdfSha256 (known only after PAdES).
  const sig = await deps.signer.sign(unsignedPdf, (h) =>
    computeLetterCanonicalPayload(content, h),
  );

  // 5. §63 Part-A metadata over the final signed pdf hash (sync). The §63
  //    `metadata` impl ignores the content argument (it only records the hash
  //    and fixed particulars), but its frozen signature is typed for the
  //    certificate content; the cast lets a letter ride the same call. The
  //    kind-aware §63 content branching lives in `generate(record)` (verify
  //    stream owns the §63 template).
  const s63meta = deps.section63.metadata(content as unknown as CredentialContent, sig.pdfSha256);

  // 6. Append to the transparency log (serialized; retry on LOG_CONFLICT).
  const append = await appendToLog({
    logRepo: deps.logRepo,
    logSigner: deps.logSigner,
    credentialId: documentId,
    canonicalSha256: sig.canonicalSha256,
    now,
  });

  // 7. Hash the candidate download password (Argon2id, PHC string).
  const passwordHash = await deps.passwordHasher.hash(input.password);

  // 8. Assemble + persist the canonical record (kind:'letter').
  const record: CredentialRecord = {
    id: documentId,
    kind: 'letter',
    content,
    status: 'valid',
    createdAt: now,
    pdfSha256: sig.pdfSha256,
    canonicalPayload: sig.canonicalPayload,
    canonicalSha256: sig.canonicalSha256,
    mldsaSignature: sig.mldsaSignature,
    mldsaPublicKeyId: sig.mldsaPublicKeyId,
    padesCertFingerprint: sig.padesCertFingerprint,
    logSeq: append.logSeq,
    logLeafHash: append.logLeafHash,
    passwordHash,
    section63: s63meta,
  };
  await deps.credentialRepo.create(record);

  // 9. Store the signed letter (reuse the 'certificate' blob kind for the
  //    primary signed PDF), then generate + store the §63 pdf.
  await deps.blobStore.put(documentId, 'certificate', sig.signedPdf);
  const s63pdf = await deps.section63.generate(record);
  await deps.blobStore.put(documentId, 'section63', s63pdf);

  // 10. Best-effort external anchor of the new signed head — never blocks.
  const head = await deps.logRepo.getHead();
  if (head) {
    try {
      const proof = await deps.anchorPublisher.publish(head);
      await deps.anchorRepo.save(proof);
    } catch (err) {
      deps.logger.warn(
        { err, documentId, headSeq: head.seq, requestId: ctx.requestId },
        'external anchor failed (non-fatal); will be re-anchored by the scheduled job',
      );
    }
  }

  // 11. Tamper-evident audit of the issuance.
  await deps.auditLog.append({
    actor: 'admin',
    action: 'letter.issue',
    subject: documentId,
    requestId: ctx.requestId,
    meta: { kind: 'letter', logSeq: append.logSeq, by: ctx.actor },
  });

  return { documentId, logSeq: append.logSeq };
}
