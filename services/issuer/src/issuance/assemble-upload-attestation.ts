/**
 * Build the `UploadAttestation` the Mode-3 attest pipeline signs and stores, and
 * sanitize the user-supplied filename to a safe basename.
 *
 * The attestation is the metadata dmj.one signs ABOUT the uploaded PDF (it has
 * no rendered content of its own). The same object reference is handed BOTH to
 * `signer.sign`'s canonical builder (`computeUploadCanonicalPayload`) AND to
 * `credentialRepo.create`'s `content`, so the verify side recomputes the exact
 * bytes that were signed.
 *
 * Pure: no I/O, no allocation, no signing, no persistence.
 */

import { DEFAULT_SIGNATORY } from '@dmjone/shared';
import type { SignUploadInput, SignaturePlacement, UploadAttestation } from '@dmjone/shared';

/** Max length of a sanitized filename (§C.1). */
const MAX_FILENAME = 200;

/**
 * Reduce a user-supplied filename to a safe basename (§C.1): strip any path
 * (handle both `/` and `\` separators), replace every character outside
 * `[A-Za-z0-9._ -]` with `_`, and cap at {@link MAX_FILENAME} chars. Empty or
 * all-stripped input falls back to `document.pdf` so the attestation always
 * carries a non-empty name (the zod schema already requires ≥1 char, this is
 * defence in depth). Pure; never throws.
 */
export function sanitizeFilename(raw: string): string {
  // Take the segment after the last path separator (forward or back slash).
  const base = raw.split(/[/\\]/).pop() ?? '';
  const cleaned = base.replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, MAX_FILENAME).trim();
  return cleaned.length > 0 ? cleaned : 'document.pdf';
}

/** The fields the route computes from the PDF bytes (not part of the request body). */
export interface UploadDerived {
  /** ISO `YYYY-MM-DD` — derived server-side (the upload schema carries no date). */
  issueDate: string;
  /** Hex SHA-256 of the uploaded bytes BEFORE any stamping. */
  originalSha256: string;
  /** Pages in the uploaded PDF (via `inspectPdf`). */
  pageCount: number;
}

/**
 * Assemble the `UploadAttestation` for one validated upload. `signaturePlacement`
 * is included ONLY when the request both asked to place the signature AND
 * supplied a placement (mirrors the `signaturePlacement ?? null` normalization
 * in `computeUploadCanonicalPayload`); omitted otherwise so the object matches
 * the canonical payload and typechecks under `exactOptionalPropertyTypes`.
 */
export function assembleUploadAttestation(
  input: SignUploadInput,
  documentId: string,
  derived: UploadDerived,
): UploadAttestation {
  const placement: SignaturePlacement | undefined =
    input.placeHandwrittenSignature && input.signaturePlacement
      ? input.signaturePlacement
      : undefined;

  return {
    documentId,
    issueDate: derived.issueDate,
    originalFilename: sanitizeFilename(input.originalFilename),
    originalSha256: derived.originalSha256,
    pageCount: derived.pageCount,
    ...(placement !== undefined && { signaturePlacement: placement }),
    signatory: { ...DEFAULT_SIGNATORY },
  };
}
