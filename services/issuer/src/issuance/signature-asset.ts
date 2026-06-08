/**
 * The dmj.one handwritten-signature PNG bytes for the Mode-3 upload-&-attest stamp
 * (embedded via pdf-lib's `embedPng`).
 *
 * Resolved at runtime from the `SIGNATURE_PNG_BASE64` env var — mounted from the
 * Secret Manager secret `signature-png` in production. The REAL signature is never
 * committed to this repo (the public GitHub mirror would leak it); when the env
 * var is absent (local dev / tests) the render package's non-personal "Specimen"
 * placeholder is used. Single source of truth with the certificate/letter
 * signature block — both go through `@dmjone/render`.
 */
import { getSignaturePngBytes } from '@dmjone/render';

/**
 * The signature PNG bytes the attest pipeline hands to `stampAttestation` as
 * `signature.pngBytes`. Resolved once at module load (the env var is set before
 * the Cloud Run process starts). Never mutated.
 */
export const SIGNATURE_PNG_BYTES: Uint8Array = getSignaturePngBytes();
