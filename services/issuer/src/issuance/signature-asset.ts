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
const SIGNATURE_PNG_BASE64 =
  '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';

/**
 * The signature PNG bytes, decoded once at module load. A fresh `Uint8Array`
 * the caller (the attest pipeline) hands to `stampAttestation` as
 * `signature.pngBytes`. Never mutated.
 */
export const SIGNATURE_PNG_BYTES: Uint8Array = new Uint8Array(
  Buffer.from(SIGNATURE_PNG_BASE64, 'base64'),
);
