/**
 * The issuance pipeline — the one place the certificate is produced.
 *
 * Order is load-bearing and mirrors the locked signing pipeline (spec §5):
 *
 *   1. allocate credential id (DMJ-<TYPE>-<YYYYMMDD>-<NN>)
 *   2. render(content)               → unsignedPdf
 *   3. signer.sign(unsignedPdf)      → detached ML-DSA-87 signature (no embedded PDF sig)
 *   4. section63.metadata(...)       → §63 Part-A metadata (sync; feeds the record)
 *   5. append leaf to transparency log (with LOG_CONFLICT retry)
 *   6. hash the candidate password (Argon2id)
 *   7. credentialRepo.create(record)
 *   8. blobStore.put(certificate) then section63.generate(record) → blobStore.put(section63)
 *   9. best-effort external anchor (never blocks issuance)
 *  10. audit the issuance
 *
 * Steps 2→3→5→8(cert)→8(section63)→10 are the externally observable ordering
 * the tests assert.
 */

import { randomBytes } from 'node:crypto';

import {
  computeCanonicalPayload,
  credentialTypeCode,
  type CredentialContent,
  type CredentialRecord,
  type IssueCredentialInput,
} from '@dmjone/shared';

import type { IssuerDeps } from '../deps.js';
import { assembleContent } from './assemble-content.js';
import { substituteAutoNumber } from './auto-number.js';
import { allocateCredentialId } from './credential-id.js';
import { appendToLog } from './log-append.js';
import { mintStatusSignature } from './sign-status.js';

export interface IssueOutcome {
  credentialId: string;
  logSeq: number;
}

/**
 * Run the full issuance pipeline for one validated request. Returns the new
 * credential id (and log sequence, for callers/telemetry). Throws an
 * {@link AppError} on any fatal step; the external anchor is best-effort and a
 * failure there is logged, not propagated.
 */
export async function issueCredential(
  deps: IssuerDeps,
  input: IssueCredentialInput,
  ctx: { requestId: string; actor: string },
): Promise<IssueOutcome> {
  const now = new Date().toISOString();

  // 1. Allocate a unique, well-formed credential id for the issue date. Certs
  //    use the per-type code (e.g. internship → IC); the allocator takes the
  //    explicit prefix so letters/uploads can share the same sequence space.
  const credentialId = await allocateCredentialId(
    deps.credentialRepo,
    credentialTypeCode(input.type),
    input.issueDate,
  );

  // Unguessable per-document retrieval token (≥128-bit base64url, CSPRNG): the
  // public verify URL is keyed on this, NOT the sequential id, so a new document
  // is not enumerable. Top-level record field only — NEVER in the canonical
  // signed payload or the /evidence bundle (design WS2-B).
  const verifyToken = randomBytes(16).toString('base64url');

  // Build the certificate content, then substitute the allocated id into any
  // `[auto]` tokens BEFORE render/sign/persist — the printed face number then
  // equals the record id, and the one signed `content` reference carries the
  // substituted prose. `assembleContent` is factored so the preview route
  // renders a byte-identical object (same field order/spread, same
  // exactOptionalPropertyTypes handling of `closingLine`); the only difference
  // is the real allocated id here vs the preview placeholder.
  const content: CredentialContent = substituteAutoNumber(
    assembleContent(input, credentialId),
    credentialId,
  );

  // QR / verify URL is keyed on the unguessable token (path, not query → no
  // referer/log leakage); the human `DMJ-…` id still prints on the face.
  const qrUrl = `${deps.env.VERIFY_PUBLIC_URL}/v/${verifyToken}`;

  // 2. Render the pixel-faithful UNSIGNED pdf.
  const unsignedPdf = await deps.renderer.render(content, { qrUrl });

  // 3. Sign: a detached ML-DSA-87 signature over canonical(content, pdfSha256), with
  //    no embedded PDF signature. The signer supplies pdfSha256 (of the delivered PDF).
  const sig = await deps.signer.sign(unsignedPdf, (h) => computeCanonicalPayload(content, h));

  // 4. §63 Part-A metadata over the final signed pdf hash (sync).
  const s63meta = deps.section63.metadata(content, sig.pdfSha256);

  // 5. Append to the transparency log (serialized; retry on LOG_CONFLICT).
  const append = await appendToLog({
    logRepo: deps.logRepo,
    logSigner: deps.logSigner,
    credentialId,
    canonicalSha256: sig.canonicalSha256,
    now,
  });

  // 6. Hash the candidate download password (Argon2id, PHC string).
  const passwordHash = await deps.passwordHasher.hash(input.password);

  // 7. Assemble + persist the canonical record (status 'valid'; no revokedAt yet).
  const record: CredentialRecord = {
    id: credentialId,
    content,
    status: 'valid',
    createdAt: now,
    // Provable, dated status assertion (asOf = createdAt for a fresh 'valid').
    statusSignature: mintStatusSignature(deps.statusSigner, credentialId, 'valid', now),
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
    // WS2-B / attestation — top-level only, never in the canonical signed
    // payload or /evidence. The token is always present on new records (plain
    // assignment, not the conditional-spread used for genuinely-maybe-absent
    // fields); attestedAt reuses `now` so it equals createdAt.
    verifyToken,
    issuerAttestation: { confirmed: true, attestedAt: now },
  };
  await deps.credentialRepo.create(record);

  // 8. Store the signed certificate, then generate + store the §63 pdf.
  await deps.blobStore.put(credentialId, 'certificate', sig.signedPdf);
  const s63pdf = await deps.section63.generate(record);
  await deps.blobStore.put(credentialId, 'section63', s63pdf);

  // 9. Best-effort external anchor of the new signed head — never blocks issuance.
  const head = await deps.logRepo.getHead();
  if (head) {
    try {
      const proof = await deps.anchorPublisher.publish(head);
      await deps.anchorRepo.save(proof);
    } catch (err) {
      deps.logger.warn(
        { err, credentialId, headSeq: head.seq, requestId: ctx.requestId },
        'external anchor failed (non-fatal); will be re-anchored by the scheduled job',
      );
    }
  }

  // 10. Tamper-evident audit of the issuance.
  await deps.auditLog.append({
    actor: 'admin',
    action: 'credential.issue',
    subject: credentialId,
    requestId: ctx.requestId,
    meta: { type: input.type, logSeq: append.logSeq, by: ctx.actor },
  });

  return { credentialId, logSeq: append.logSeq };
}
