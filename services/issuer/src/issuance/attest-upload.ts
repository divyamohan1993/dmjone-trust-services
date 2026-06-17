/**
 * The upload-&-attest pipeline (Mode 3, spec §C.3) — the new subsystem.
 *
 * Unlike the certificate/letter pipelines (which render the document), this one
 * STAMPS a user-uploaded PDF: it draws a visible validation mark (QR + caption)
 * on every page and, optionally, the dmj.one handwritten-signature PNG, then
 * ML-DSA-87-signs the STAMPED bytes (detached; no embedded PDF signature). The document id must exist BEFORE
 * stamping because the stamp's QR encodes the verify URL for that id.
 *
 *   1. (caller) validate `signUploadSchema` + the PDF bytes →
 *      originalSha256 = SHA-256(raw uploaded bytes), pageCount via inspectPdf
 *   2. allocate documentId = DMJ-DOC-<YYYYMMDD>-<NN>
 *   3. stamped = stampAttestation({ pdfBytes, documentId, verifyUrl, issueDateIso,
 *                                   signature? })
 *   4. sig = signer.sign(stamped, (h) => computeUploadCanonicalPayload(attestation, h))
 *   5. §63 metadata over sig.pdfSha256; append log; hash password;
 *      credentialRepo.create({ kind:'upload', content: attestation, ... });
 *      blobStore.put(certificate) + §63; anchor; audit
 *   6. (caller) respond `application/pdf` (the signed bytes) + X-Document-Id
 *
 * The originalSha256 is computed over the RAW uploaded bytes (before stamping),
 * so the attestation records what the uploader actually handed us. The signed
 * PDF's own `pdfSha256` is recorded too, so the upload-a-file verify path also
 * matches the stored bytes.
 */

import { createHash, randomBytes } from 'node:crypto';

import {
  computeUploadCanonicalPayload,
  DOCUMENT_ID_PREFIX,
  type CredentialContent,
  type CredentialRecord,
  type SignUploadInput,
  type UploadAttestation,
} from '@dmjone/shared';
import { stampAttestation, inspectPdf } from '@dmjone/render';

import type { IssuerDeps } from '../deps.js';
import { assembleUploadAttestation } from './assemble-upload-attestation.js';
import { mintStatusSignature } from './sign-status.js';
import { allocateCredentialId } from './credential-id.js';
import { appendToLog } from './log-append.js';
import { SIGNATURE_PNG_BYTES } from './signature-asset.js';

export interface AttestUploadOutcome {
  documentId: string;
  logSeq: number;
  /** The final signed PDF bytes — the route streams these back to the caller. */
  signedPdf: Uint8Array;
}

/** Hex SHA-256 of bytes (the raw upload digest). Node built-in; no crypto-pkg coupling. */
function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Run the full attest pipeline for one validated upload + its PDF bytes.
 * `pdfBytes` are the raw uploaded bytes (already size/header-checked by the
 * route). Returns the new document id, log sequence, and the signed PDF bytes.
 * Throws an {@link AppError} on any fatal step; the external anchor is
 * best-effort.
 */
export async function attestUpload(
  deps: IssuerDeps,
  input: SignUploadInput,
  pdfBytes: Uint8Array,
  ctx: { requestId: string; actor: string },
): Promise<AttestUploadOutcome> {
  const now = new Date().toISOString();
  // The upload schema carries no issue date; derive one server-side and thread
  // the SAME value to the id, the attestation, and the stamp caption.
  const issueDate = now.slice(0, 10);

  // 1. Digest the RAW bytes (before any stamping) + count pages.
  const originalSha256 = sha256Hex(pdfBytes);
  const { pageCount } = await inspectPdf(pdfBytes);

  // 2. Allocate the DMJ-DOC id (must exist before stamping — the QR encodes it).
  const documentId = await allocateCredentialId(
    deps.credentialRepo,
    DOCUMENT_ID_PREFIX.upload,
    issueDate,
  );

  // 2b. Build the attestation ONCE; this exact reference is what we sign over
  //     and persist — so the verify-side recompute matches the signed bytes.
  const attestation: UploadAttestation = assembleUploadAttestation(input, documentId, {
    issueDate,
    originalSha256,
    pageCount,
  });

  // Unguessable per-document retrieval token (≥128-bit base64url, CSPRNG),
  // generated BEFORE stamping because the stamp's QR encodes the verify URL,
  // which is keyed on the token (design WS2-B). Top-level record field only —
  // never canonical-signed, never in /evidence. There is no `[auto]` step for
  // uploads: an upload carries no issuer-authored prose, only attestation
  // metadata about the uploaded bytes.
  const verifyToken = randomBytes(16).toString('base64url');

  // 3. Stamp every page with the validation mark (QR → verify URL), plus the
  //    handwritten-signature PNG when requested. The placements on the
  //    attestation are present (non-empty) iff the request asked to place AND
  //    supplied at least one; the signature is drawn once per placement page.
  //    The QR is keyed on the unguessable token, not the sequential id.
  const verifyUrl = `${deps.env.VERIFY_PUBLIC_URL}/v/${verifyToken}`;
  const stamped = await stampAttestation({
    pdfBytes,
    documentId,
    verifyUrl,
    issueDateIso: issueDate,
    ...(attestation.signaturePlacements !== undefined && {
      signature: {
        pngBytes: SIGNATURE_PNG_BYTES,
        placements: attestation.signaturePlacements,
      },
    }),
  });

  // 4. Sign the STAMPED bytes: a detached ML-DSA-87 signature over the upload
  //    canonical payload (no embedded PDF signature). The signer supplies pdfSha256.
  const sig = await deps.signer.sign(stamped, (h) =>
    computeUploadCanonicalPayload(attestation, h),
  );

  // 5. §63 Part-A metadata over the signed pdf hash. As with letters, the §63
  //    `metadata` impl ignores its content argument (records hash + fixed
  //    particulars); its frozen signature is typed for certificate content, so
  //    the cast lets an upload ride the same call. Kind-aware §63 content
  //    branching lives in `generate(record)` (verify stream).
  const s63meta = deps.section63.metadata(
    attestation as unknown as CredentialContent,
    sig.pdfSha256,
  );

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

  // 8. Assemble + persist the canonical record (kind:'upload').
  const record: CredentialRecord = {
    id: documentId,
    kind: 'upload',
    content: attestation,
    status: 'valid',
    createdAt: now,
    statusSignature: mintStatusSignature(deps.statusSigner, documentId, 'valid', now),
    pdfSha256: sig.pdfSha256,
    canonicalPayload: sig.canonicalPayload,
    canonicalSha256: sig.canonicalSha256,
    mldsaSignature: sig.mldsaSignature,
    mldsaPublicKeyId: sig.mldsaPublicKeyId,
    padesCertFingerprint: sig.padesCertFingerprint,
    // Best-effort RFC-3161 timestamp over the raw ML-DSA signature; present iff
    // the signer reached a TSA. Conditional spread keeps the key absent (not
    // `: undefined`) under exactOptionalPropertyTypes.
    ...(sig.tsaTimestampToken !== undefined && { tsaTimestampToken: sig.tsaTimestampToken }),
    logSeq: append.logSeq,
    logLeafHash: append.logLeafHash,
    passwordHash,
    section63: s63meta,
    // WS2-B / attestation — top-level only, never canonical-signed or in
    // /evidence. Always present on new records; attestedAt === createdAt.
    verifyToken,
    issuerAttestation: { confirmed: true, attestedAt: now },
  };
  await deps.credentialRepo.create(record);

  // 9. Store the signed (stamped) PDF under the 'certificate' blob kind, then
  //    generate + store the §63 pdf.
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

  // 11. Tamper-evident audit of the attestation.
  await deps.auditLog.append({
    actor: 'admin',
    action: 'upload.attest',
    subject: documentId,
    requestId: ctx.requestId,
    meta: {
      kind: 'upload',
      logSeq: append.logSeq,
      by: ctx.actor,
      pages: pageCount,
      signed: (attestation.signaturePlacements?.length ?? 0) > 0,
    },
  });

  return { documentId, logSeq: append.logSeq, signedPdf: sig.signedPdf };
}
