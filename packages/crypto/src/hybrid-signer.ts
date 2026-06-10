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
import forge from 'node-forge';
import { bytesToBase64, sha256Hex, toUtf8Bytes } from './hash.js';
import { binaryStringToBytes } from './pades-util.js';
import { requestTimestampToken, type TsaOptions } from './tsa.js';

/**
 * Build a {@link HybridSigner} bound to the issuer's decrypted signing keys.
 * Constructed only inside the issuer service; the verify service never has the
 * secret material to call this.
 *
 * When `opts.tsa` is set, the signer additionally obtains an RFC-3161 trusted
 * timestamp over the RAW ML-DSA signature bytes and returns it (base64 DER) as
 * {@link HybridSignatureResult.tsaTimestampToken}. The token is NOT embedded in
 * the PDF — the delivered bytes stay byte-identical to the rendered PDF (the
 * detached-signature design); it is stored server-side as independent forensic
 * evidence of WHEN the signature existed. This is strictly best-effort: a TSA
 * outage/timeout/rejection leaves the token absent and NEVER blocks or fails
 * signing (the transparency-log head + external anchor remain the primary
 * trusted timestamp).
 */
export function createHybridSigner(keys: SigningKeys, opts?: { tsa?: TsaOptions }): HybridSigner {
  const tsa = opts?.tsa;
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
      const rawSignatureBytes = ml_dsa87.sign(canonicalBytes, keys.mldsaSecretKey);
      const mldsaSignature = bytesToBase64(rawSignatureBytes);

      // 6. Canonical hash (the transparency-log leaf input).
      const canonicalSha256 = sha256Hex(canonicalBytes);

      const result: HybridSignatureResult = {
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

      // 7. Best-effort RFC-3161 timestamp over the RAW ML-DSA signature bytes
      //    (NOT the base64 string) — independent proof of when the signature
      //    existed. The imprint is over exactly these bytes, so a verifier checks
      //    it against base64ToBytes(record.mldsaSignature). requestTimestampToken
      //    swallows every failure (returns null); the whole block is additionally
      //    wrapped so a malformed token / serialization error can never throw —
      //    the invariant is that a TSA never blocks or fails issuance.
      if (tsa) {
        try {
          const token = await requestTimestampToken(rawSignatureBytes, tsa);
          if (token) {
            result.tsaTimestampToken = bytesToBase64(
              binaryStringToBytes(forge.asn1.toDer(token).getBytes()),
            );
          }
        } catch {
          // Leave tsaTimestampToken absent; issuance proceeds unaffected.
        }
      }

      return result;
    },
  };
}
