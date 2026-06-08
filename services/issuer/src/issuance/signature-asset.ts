/**
 * The dmj.one handwritten-signature image, as a clean transparent PNG, for the
 * Mode-3 upload-&-attest stamp (embedded via pdf-lib's `embedPng`).
 *
 * Generated from the brand `signature.jpg` by `packages/render/clean-signature.mjs`:
 * the white background is keyed to transparent, JPEG speckle/ringing is despeckled
 * (small isolated blobs dropped), the ink is recoloured to a uniform crisp blue,
 * and the mark is supersampled (436x376) for a sharp stamp. The same
 * asset backs the certificate/letter signature blocks via `@dmjone/render`'s
 * `getBrandImages()` (now `signature.png`).
 *
 * Vendored as base64 (decoded once at module load) so it ships through `tsc` into
 * `dist` with no asset-copy step. Pure data: no I/O, side-effect-free.
 */
const SIGNATURE_PNG_BASE64 = 'REDACTED-real-signature-now-in-Secret-Manager';

/**
 * The signature PNG bytes, decoded once at module load. A fresh `Uint8Array` the
 * caller (the attest pipeline) hands to `stampAttestation` as `signature.pngBytes`.
 * Never mutated.
 */
export const SIGNATURE_PNG_BYTES: Uint8Array = new Uint8Array(
  Buffer.from(SIGNATURE_PNG_BASE64, 'base64'),
);
