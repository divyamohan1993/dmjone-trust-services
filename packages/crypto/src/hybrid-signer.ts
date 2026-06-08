/**
 * The hybrid signing pipeline — the cryptographic heart of issuance.
 *
 * The delivered PDF carries NO embedded digital signature (no PAdES / PKCS#7
 * dictionary). A self-signed PAdES object made common readers (Edge/Chrome
 * built-in viewers) flash an "Invalid Signature / Document modified" banner that
 * alarmed recipients, so it was removed. Authenticity now rests SOLELY on:
 *   - the DETACHED post-quantum ML-DSA-87 (FIPS 204) signature over the canonical
 *     record — stored server-side + recorded in the public append-only
 *     transparency log (+ external anchor); and
 *   - the visible validation-ID QR stamped on the document → verify.dmj.one.
 *
 * Order is LOCKED by the {@link HybridSigner} contract; any reordering breaks
 * upload-verify or makes ML-DSA cover the wrong bytes:
 *
 *   1. (caller renders)              → unsignedPdf  (the stamped/rendered PDF)
 *   2. signedPdf       = unsignedPdf  (delivered AS-IS — never mutated)
 *   3. pdfSha256       = SHA-256(unsignedPdf)
 *   4. canonical       = buildCanonicalPayload(pdfSha256)   (caller-supplied, by kind)
 *   5. mldsaSignature  = ML-DSA-87.sign(UTF8(canonical))    (DETACHED — never in the PDF)
 *   6. canonicalSha256 = SHA-256(UTF8(canonical))           (the transparency-log leaf input)
 *
 * The ML-DSA signature is detached on purpose: writing it into the PDF would
 * change pdfSha256 and break the 1-bit upload-verify guarantee. Because the
 * delivered bytes ARE the rendered bytes, pdfSha256 is the hash of exactly what
 * the recipient holds, which is what upload-verify (file hash) checks.
 */

import { ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import {
  type HybridSignatureResult,
  type HybridSigner,
  type SigningKeys,
} from '@dmjone/shared';
import { bytesToBase64, sha256Hex, toUtf8Bytes } from './hash.js';
import type { TsaOptions } from './tsa.js';

/**
 * Build a {@link HybridSigner} bound to the issuer's decrypted signing keys.
 * Constructed only inside the issuer service; the verify service never has the
 * secret material to call this.
 *
 * `opts.tsa` is accepted for call-site compatibility (the issuer composition
 * root and the LTV smoke still pass it) but is IGNORED: with no embedded PAdES
 * there is no PKCS#7 signature to timestamp. The trusted timestamp is the
 * transparency-log head (+ external anchor), not an RFC-3161 token.
 */
export function createHybridSigner(keys: SigningKeys, opts?: { tsa?: TsaOptions }): HybridSigner {
  void opts; // accepted for compatibility; no PAdES ⇒ no TSA timestamp to embed.
  return {
    async sign(
      unsignedPdf: Uint8Array,
      buildCanonicalPayload: (pdfSha256: string) => string,
    ): Promise<HybridSignatureResult> {
      // 2. The delivered PDF is the rendered PDF, byte-for-byte. No embedding.
      const signedPdf = unsignedPdf;

      // 3. Hash the delivered (== rendered) bytes — what upload-verify checks.
      const pdfSha256 = sha256Hex(signedPdf);

      // 4. Canonical payload — built by the caller from pdfSha256 (by document
      //    kind). The shared builders keep this identical on the verify side.
      const canonicalPayload = buildCanonicalPayload(pdfSha256);
      const canonicalBytes = toUtf8Bytes(canonicalPayload);

      // 5. Detached ML-DSA-87 signature over the canonical bytes.
      const mldsaSignature = bytesToBase64(ml_dsa87.sign(canonicalBytes, keys.mldsaSecretKey));

      // 6. Canonical hash (the transparency-log leaf input).
      const canonicalSha256 = sha256Hex(canonicalBytes);

      return {
        signedPdf,
        pdfSha256,
        canonicalPayload,
        canonicalSha256,
        mldsaSignature,
        mldsaPublicKeyId: keys.mldsaPublicKeyId,
        // No embedded certificate — authenticity is the detached ML-DSA
        // signature + transparency log + QR, not a PKCS#7 signer cert.
        padesCertFingerprint: '',
      };
    },
  };
}
