/**
 * The dmj.one handwritten-signature image, as PNG bytes, for the Mode-3
 * upload-&-attest stamp.
 *
 * Why a vendored base64 PNG and not `@dmjone/render`'s `getBrandImages()`:
 * the render package's signature asset is a JPEG (`signature.jpg`), but the
 * frozen `stampAttestation(StampInput)` contract embeds the handwritten stamp
 * via pdf-lib's `embedPng` — feeding it JPEG bytes throws. The render/brand
 * streams own the signature asset and should publish a transparent signature
 * PNG; until then this stream vendors a one-time, lossless JPEG->PNG conversion
 * of that exact same brand signature (the near-white background keyed to
 * transparent), so the stamped mark is visually the certificate's signature.
 *
 * It is embedded as a base64 string (decoded once at module load) rather than a
 * binary asset so it ships through `tsc` into `dist` with no asset-copy step
 * and no `import.meta.url` path resolution — the image is tiny (109x94).
 *
 * Pure data: no I/O, no allocation, side-effect-free.
 */

/**
 * Transparent PNG (109x94) of the dmj.one signature — the same mark the
 * certificate signature block shows, converted from the brand `signature.jpg`
 * with the near-white background keyed out. PNG magic `89 50 4E 47`, so
 * `stampAttestation`'s `embedPng` accepts it.
 */
const SIGNATURE_PNG_BASE64 = 'REDACTED-real-signature-now-in-Secret-Manager';

/**
 * The signature PNG bytes, decoded once at module load. A fresh `Uint8Array`
 * the caller (the attest pipeline) hands to `stampAttestation` as
 * `signature.pngBytes`. Never mutated.
 */
export const SIGNATURE_PNG_BYTES: Uint8Array = new Uint8Array(
  Buffer.from(SIGNATURE_PNG_BASE64, 'base64'),
);
