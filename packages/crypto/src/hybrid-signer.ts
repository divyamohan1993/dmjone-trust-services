/**
 * The hybrid signing pipeline — the cryptographic heart of issuance.
 *
 * Order is LOCKED by the {@link HybridSigner} contract; any reordering breaks
 * upload-verify or makes ML-DSA cover the wrong bytes:
 *
 *   1. (caller renders)              → unsignedPdf
 *   2. embed PAdES placeholder + sign → signedPdf   (FINAL — never mutated after)
 *   3. pdfSha256      = SHA-256(signedPdf)
 *   4. canonical      = computeCanonicalPayload(content, pdfSha256)   (shared)
 *   5. mldsaSignature = ML-DSA-65.sign(UTF8(canonical))   (DETACHED — never in the PDF)
 *   6. canonicalSha256 = SHA-256(UTF8(canonical))
 *
 * Because ML-DSA covers pdfSha256, and pdfSha256 is the hash of the already
 * PAdES-signed bytes, the post-quantum signature transitively covers the PAdES
 * signature too. The ML-DSA signature is detached on purpose: writing it into
 * the PDF would change pdfSha256 and break the 1-bit upload-verify guarantee.
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { SignPdf } from '@signpdf/signpdf';
import {
  computeCanonicalPayload,
  type CredentialContent,
  type HybridSignatureResult,
  type HybridSigner,
  type SigningKeys,
} from '@dmjone/shared';
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';
import { bytesToBase64, sha256Hex, toUtf8Bytes } from './hash.js';
import { certFingerprint } from './pades-util.js';
import { ForgePadesSigner } from './pades-signer.js';

/** Placeholder metadata embedded in the PAdES signature dictionary. */
const PLACEHOLDER_META = {
  reason: 'Document authenticity — dmj.one Trust Services',
  contactInfo: 'verify.dmj.one',
  name: 'dmj.one Trust Services',
  location: 'IN',
} as const;

/**
 * Embed a PAdES placeholder into the (Chromium-rendered) PDF and sign it with
 * the detached PKCS#7 signer. Returns the FINAL signed bytes — never mutated.
 *
 * Uses @signpdf/placeholder-plain, which performs an INCREMENTAL UPDATE: it
 * appends the signature dictionary + a fresh xref section to the END of the
 * original bytes, leaving them byte-for-byte intact. This preserves the
 * pixel-faithful Chromium output exactly (a full pdf-lib re-serialize could
 * silently alter appearance) and is the standard PAdES approach. It requires the
 * input PDF to carry a classic cross-reference TABLE (which Chromium emits).
 */
async function embedAndSignPades(unsignedPdf: Uint8Array, keys: SigningKeys): Promise<Uint8Array> {
  const withPlaceholder = plainAddPlaceholder({
    pdfBuffer: Buffer.from(unsignedPdf),
    ...PLACEHOLDER_META,
  });

  const signer = new ForgePadesSigner(keys.padesCertPem, keys.padesKeyPem);
  const signed = await new SignPdf().sign(withPlaceholder, signer);
  return new Uint8Array(signed);
}

/**
 * Build a {@link HybridSigner} bound to the issuer's decrypted signing keys.
 * Constructed only inside the issuer service; the verify service never has the
 * secret material to call this.
 */
export function createHybridSigner(keys: SigningKeys): HybridSigner {
  return {
    async sign(
      unsignedPdf: Uint8Array,
      content: CredentialContent,
    ): Promise<HybridSignatureResult> {
      // 2. PAdES sign → FINAL signed PDF.
      const signedPdf = await embedAndSignPades(unsignedPdf, keys);

      // 3. Hash the final signed bytes.
      const pdfSha256 = sha256Hex(signedPdf);

      // 4. Canonical payload (shared definition — identical on verify side).
      const canonicalPayload = computeCanonicalPayload(content, pdfSha256);
      const canonicalBytes = toUtf8Bytes(canonicalPayload);

      // 5. Detached ML-DSA-65 signature over the canonical bytes.
      const mldsaSignature = bytesToBase64(ml_dsa65.sign(canonicalBytes, keys.mldsaSecretKey));

      // 6. Canonical hash (the transparency-log leaf input).
      const canonicalSha256 = sha256Hex(canonicalBytes);

      return {
        signedPdf,
        pdfSha256,
        canonicalPayload,
        canonicalSha256,
        mldsaSignature,
        mldsaPublicKeyId: keys.mldsaPublicKeyId,
        padesCertFingerprint: certFingerprint(keys.padesCertPem),
      };
    },
  };
}
