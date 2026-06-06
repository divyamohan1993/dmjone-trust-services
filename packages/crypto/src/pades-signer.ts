/**
 * Custom @signpdf Signer that produces a PAdES-compatible detached PKCS#7
 * signature using our self-signed RSA X.509 key via node-forge.
 *
 * @signpdf/signpdf drives the placeholder/ByteRange mechanics and calls
 * {@link ForgePadesSigner.sign} with the exact bytes to be signed (the PDF with
 * the signature contents window excised). We return the DER of a detached
 * SignedData. The signature is `adbe.pkcs7.detached` (SubFilter set by the
 * placeholder) and carries the standard authenticated attributes (contentType,
 * messageDigest, signingTime) that a PAdES baseline signature requires.
 *
 * The signer is intentionally pluggable (design §7): swapping this for a
 * licensed-CA DSC signer is the only change needed to gain the IT Act §85B
 * statutory presumption, with no impact on the hybrid pipeline.
 */

import { Signer } from '@signpdf/signpdf';
import forge from 'node-forge';
import {
  injectTimestampToken,
  requestTimestampToken,
  signerInfoSignature,
  type TsaOptions,
} from './tsa.js';

export class ForgePadesSigner extends Signer {
  readonly #cert: forge.pki.Certificate;
  readonly #key: forge.pki.rsa.PrivateKey;
  readonly #tsa: TsaOptions | undefined;

  /** @param tsa optional RFC-3161 TSA — when set, signatures are PAdES-B-T. */
  constructor(certPem: string, keyPem: string, tsa?: TsaOptions) {
    super();
    this.#cert = forge.pki.certificateFromPem(certPem);
    this.#key = forge.pki.privateKeyFromPem(keyPem);
    this.#tsa = tsa;
  }

  /**
   * @param pdfBuffer the bytes to sign (provided by @signpdf)
   * @param signingTime signing time chosen by @signpdf (defaults to now)
   * @returns the detached PKCS#7 SignedData, DER-encoded, as a Buffer
   */
  override async sign(pdfBuffer: Buffer, signingTime?: Date): Promise<Buffer> {
    const p7 = forge.pkcs7.createSignedData();
    // Detached: the content is hashed into messageDigest but not embedded.
    // 'raw' tells forge the string is already a byte (binary) string, not UTF-8.
    p7.content = forge.util.createBuffer(pdfBuffer.toString('latin1'), 'raw');
    p7.addCertificate(this.#cert);
    p7.addSigner({
      key: this.#key,
      certificate: this.#cert,
      digestAlgorithm: forge.pki.oids['sha256'] as string,
      authenticatedAttributes: [
        { type: forge.pki.oids['contentType'] as string, value: forge.pki.oids['data'] as string },
        // messageDigest value is computed by forge over p7.content.
        { type: forge.pki.oids['messageDigest'] as string },
        {
          type: forge.pki.oids['signingTime'] as string,
          value: (signingTime ?? new Date()).toISOString(),
        },
      ],
    });
    p7.sign({ detached: true });

    const p7Asn1 = p7.toAsn1();
    // PAdES-B-T: best-effort RFC-3161 signature timestamp as an UNSIGNED attr.
    // Any failure (TSA down, timeout, malformed) leaves a valid PAdES-B-B
    // signature — the transparency log + anchor remain the primary timestamp.
    if (this.#tsa) {
      const sig = signerInfoSignature(p7Asn1);
      if (sig) {
        const token = await requestTimestampToken(sig, this.#tsa);
        if (token) injectTimestampToken(p7Asn1, token);
      }
    }
    const der = forge.asn1.toDer(p7Asn1).getBytes();
    return Buffer.from(der, 'binary');
  }
}
