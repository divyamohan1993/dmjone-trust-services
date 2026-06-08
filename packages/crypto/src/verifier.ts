/**
 * Signature verification — the public trust anchor.
 *
 * Two independent checks, mirroring the two halves of the hybrid signature:
 *
 *  - {@link SignatureVerifier.verifyMldsa}: the authoritative check for a
 *    certificate. Rebuilds the canonical payload via the SHARED
 *    computeCanonicalPayload (byte-identical to issue-time) and verifies the
 *    detached ML-DSA-87 signature. Never throws — any malformed input is a
 *    verification failure, not an exception.
 *  - {@link SignatureVerifier.verifyMldsaForRecord}: the same check for ANY
 *    stored record, rebuilding the payload BY KIND via the SHARED
 *    computeCanonicalPayloadForRecord (byte-identical to verifyMldsa for a
 *    certificate). This is what the verify service calls on an id lookup.
 *  - {@link SignatureVerifier.verifyPdfPades}: only meaningful in the file-upload
 *    flow. Parses the embedded PKCS#7, recomputes the ByteRange digest and
 *    checks it against the signed messageDigest, and verifies the RSA signature
 *    over the authenticated attributes. A single flipped byte breaks the digest.
 *
 * This module holds NO secret material — it runs safely in the keyless verify
 * service with only public keys + the public certificate.
 */

import { ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import {
  computeCanonicalPayload,
  computeCanonicalPayloadForRecord,
  type CredentialContent,
  type CredentialRecord,
  type PadesVerifyResult,
  type SignatureVerifier,
  type VerifyingKeys,
} from '@dmjone/shared';
import forge from 'node-forge';
import { base64ToBytes, sha256Hex, toUtf8Bytes } from './hash.js';
import { binaryStringToBytes } from './pades-util.js';

/** Matches the filled `/ByteRange [a b c d]` written by @signpdf at sign-time. */
const BYTE_RANGE_RE = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/;

export function createSignatureVerifier(keys: VerifyingKeys): SignatureVerifier {
  /**
   * Verify the detached ML-DSA-87 signature over an already-derived canonical
   * payload string. The single place the verify-side check runs; both the
   * certificate path and the by-kind path funnel through it so the bytes are
   * treated identically. Never throws — any malformed input is a failure.
   */
  function verifyCanonical(canonical: string, signatureB64: string): boolean {
    try {
      const sig = base64ToBytes(signatureB64);
      return ml_dsa87.verify(sig, toUtf8Bytes(canonical), keys.mldsaPublicKey);
    } catch {
      // Malformed signature / inputs → not verified. Never leak details.
      return false;
    }
  }

  return {
    verifyMldsa(content: CredentialContent, pdfSha256: string, signatureB64: string): boolean {
      return verifyCanonical(computeCanonicalPayload(content, pdfSha256), signatureB64);
    },

    verifyMldsaForRecord(record: CredentialRecord): boolean {
      // Recompute the signed bytes BY KIND. For a certificate record this is
      // byte-identical to verifyMldsa(record.content, record.pdfSha256, …).
      return verifyCanonical(computeCanonicalPayloadForRecord(record), record.mldsaSignature);
    },

    async verifyPdfPades(signedPdf: Uint8Array): Promise<PadesVerifyResult> {
      return verifyPades(signedPdf);
    },
  };
}

/**
 * Parse and verify the embedded PAdES PKCS#7. Standalone (no @signpdf runtime
 * dependency) so the verify service stays lean. Always resolves — a missing or
 * broken signature yields `{ present:false }` / `{ intact:false }`.
 */
function verifyPades(signedPdf: Uint8Array): PadesVerifyResult {
  const pdf = Buffer.from(signedPdf);
  const latin = pdf.toString('latin1');
  const m = BYTE_RANGE_RE.exec(latin);
  if (!m) return { present: false, intact: false };

  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  const d = Number(m[4]);

  // Reconstruct exactly the bytes the signature covers (the contents window is
  // excised: [a, a+b) ++ [c, c+d)).
  const signedData = Buffer.concat([pdf.subarray(a, a + b), pdf.subarray(c, c + d)]);

  // The hex signature lives between the '<' at a+b and the '>' at c, padded
  // with trailing 00s out to the placeholder length. Strip the padding.
  let sigHex = pdf
    .subarray(a + b + 1, c)
    .toString('latin1')
    .replace(/[^0-9a-fA-F]/g, '');
  sigHex = sigHex.replace(/(?:00)+$/i, '');
  if (sigHex.length % 2 === 1) sigHex = sigHex.slice(0, -1);

  let msg: ReturnType<typeof forge.pkcs7.messageFromAsn1>;
  try {
    msg = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(Buffer.from(sigHex, 'hex').toString('binary')));
  } catch {
    return { present: true, intact: false };
  }

  const signedDataMsg = msg as typeof msg & {
    certificates?: forge.pki.Certificate[];
    rawCapture?: { authenticatedAttributes?: forge.asn1.Asn1[]; signature?: string };
  };
  const cert = signedDataMsg.certificates?.[0];
  const rawCapture = signedDataMsg.rawCapture;
  if (!cert || !rawCapture?.authenticatedAttributes || rawCapture.signature === undefined) {
    return { present: true, intact: false };
  }

  const certFingerprint = sha256Hex(
    binaryStringToBytes(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()),
  );
  const signerSubject = formatSubject(cert);

  // 1. messageDigest authenticated attribute must equal SHA-256(signedData).
  const signedDigestHex = forge.md.sha256.create().update(signedData.toString('binary')).digest().toHex();
  const messageDigestHex = extractMessageDigestHex(rawCapture.authenticatedAttributes);
  const digestMatch = messageDigestHex !== null && messageDigestHex === signedDigestHex;

  // 2. RSA signature must verify over DER(SET OF authenticatedAttributes).
  const signatureOk = verifyAuthAttributesSignature(
    cert,
    rawCapture.authenticatedAttributes,
    rawCapture.signature,
  );

  return {
    present: true,
    intact: digestMatch && signatureOk,
    certFingerprint,
    signerSubject,
  };
}

/** Pull the messageDigest OCTET STRING (as hex) from the authenticated attributes. */
function extractMessageDigestHex(authAttrs: forge.asn1.Asn1[]): string | null {
  for (const attr of authAttrs) {
    const fields = (attr as { value?: forge.asn1.Asn1[] }).value;
    if (!fields || fields.length < 2) continue;
    const oid = forge.asn1.derToOid((fields[0] as { value: string }).value);
    if (oid !== forge.pki.oids['messageDigest']) continue;
    const setValues = (fields[1] as { value?: forge.asn1.Asn1[] }).value;
    const octet = setValues?.[0] as { value?: string } | undefined;
    if (octet?.value === undefined) return null;
    return forge.util.bytesToHex(octet.value);
  }
  return null;
}

/** Verify the RSA signature over the canonical DER of the authenticated attributes. */
function verifyAuthAttributesSignature(
  cert: forge.pki.Certificate,
  authAttrs: forge.asn1.Asn1[],
  signature: string,
): boolean {
  try {
    // Signature is computed over an explicit SET OF (tag 0x31), not the
    // context-tagged [0] form in which the attributes appear in the message.
    const attrSet = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SET,
      true,
      authAttrs,
    );
    const digest = forge.md.sha256
      .create()
      .update(forge.asn1.toDer(attrSet).getBytes())
      .digest()
      .getBytes();
    const rsaPub = cert.publicKey as forge.pki.rsa.PublicKey;
    return rsaPub.verify(digest, signature);
  } catch {
    return false;
  }
}

/** Render the certificate subject as a stable `CN=…, OU=…, C=…` string. */
function formatSubject(cert: forge.pki.Certificate): string {
  return cert.subject.attributes
    .map((attr) => {
      const sn = (attr as { shortName?: string }).shortName ?? (attr as { name?: string }).name ?? '?';
      const value = (attr as { value?: unknown }).value;
      return `${sn}=${String(value ?? '')}`;
    })
    .join(', ');
}
