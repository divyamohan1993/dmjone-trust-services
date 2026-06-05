/**
 * Small node-forge helpers shared by key generation, the hybrid signer, and the
 * PAdES verifier. Centralised so the DER-encoding + fingerprint definition lives
 * in exactly one place (the fingerprint is part of the signed record).
 */

import forge from 'node-forge';
import { sha256Hex } from './hash.js';

/** node-forge emits DER as a binary string; widen it to raw bytes. */
export function binaryStringToBytes(binary: string): Uint8Array {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i) & 0xff;
  return out;
}

/** DER bytes of a PEM-encoded X.509 certificate. */
export function certPemToDer(certPem: string): Uint8Array {
  const cert = forge.pki.certificateFromPem(certPem);
  return binaryStringToBytes(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
}

/** SHA-256 (hex) of a certificate's DER encoding — the PAdES cert fingerprint. */
export function certFingerprint(certPem: string): string {
  return sha256Hex(certPemToDer(certPem));
}
