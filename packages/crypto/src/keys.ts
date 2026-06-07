/**
 * One-time key material generation.
 *
 * Two independent keypairs back the hybrid signature:
 *   - ML-DSA-87 (FIPS 204) for the post-quantum detached signature.
 *   - A self-signed RSA-3072 X.509 certificate for the embedded PAdES PKCS#7.
 *
 * These are generated once at install/setup, encrypted at rest by Stream D, and
 * loaded into memory only inside the issuer service. Nothing here performs I/O
 * or persistence — it returns plain key material for the caller to store safely.
 */

import { ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import forge from 'node-forge';
import { sha256Hex } from './hash.js';
import { binaryStringToBytes } from './pades-util.js';

/** Number of hex chars taken from sha256(publicKey) to form a stable key id. */
const PUBLIC_KEY_ID_HEX_LEN = 16;

/** Fixed X.509 identity for the document-signing certificate (per design §2). */
const PADES_SUBJECT_ATTRS: forge.pki.CertificateField[] = [
  { name: 'commonName', value: 'dmj.one Trust Services' },
  { name: 'organizationalUnitName', value: 'Document Signing' },
  { name: 'countryName', value: 'IN' },
];

/** RSA modulus size for the PAdES signing key. */
const PADES_RSA_BITS = 3072;

/** Certificate validity window: ~25 years (the keys are long-lived, used only at issue-time). */
const PADES_VALIDITY_YEARS = 25;

export interface MldsaKeypair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  /** First 16 hex chars of SHA-256(publicKey); stable id/version for the key. */
  publicKeyId: string;
}

/** Generate a fresh ML-DSA-87 keypair plus its derived public-key id. */
export function generateMldsaKeypair(): MldsaKeypair {
  const { publicKey, secretKey } = ml_dsa87.keygen();
  const pub = Uint8Array.from(publicKey);
  return {
    publicKey: pub,
    secretKey: Uint8Array.from(secretKey),
    publicKeyId: mldsaPublicKeyId(pub),
  };
}

/** Derive the stable public-key id (first 16 hex of SHA-256(publicKey)). */
export function mldsaPublicKeyId(publicKey: Uint8Array): string {
  return sha256Hex(publicKey).slice(0, PUBLIC_KEY_ID_HEX_LEN);
}

export interface PadesCertOptions {
  /** Override the random serial number (tests use a fixed one for determinism). */
  serialNumber?: string;
  /** Override notBefore (defaults to now). */
  notBefore?: Date;
}

export interface PadesCert {
  certPem: string;
  keyPem: string;
  /** SHA-256 (hex) of the certificate's DER encoding. */
  fingerprint: string;
}

/**
 * Generate a self-signed RSA-3072 certificate for PAdES signing.
 *
 * Self-signed by design: our web verifier is the trust anchor, not a public CA.
 * keyUsage is digitalSignature + nonRepudiation (content commitment) — the
 * minimal set for a document-signing certificate. The interface is pluggable so
 * a licensed-CA DSC can replace this later (design §7) without touching callers.
 */
export function generateSelfSignedPadesCert(opts: PadesCertOptions = {}): PadesCert {
  const keys = forge.pki.rsa.generateKeyPair({ bits: PADES_RSA_BITS, e: 0x10001 });
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = opts.serialNumber ?? randomSerial();

  const notBefore = opts.notBefore ?? new Date();
  const notAfter = new Date(notBefore);
  notAfter.setFullYear(notAfter.getFullYear() + PADES_VALIDITY_YEARS);
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  cert.setSubject(PADES_SUBJECT_ATTRS);
  // Self-signed: issuer == subject.
  cert.setIssuer(PADES_SUBJECT_ATTRS);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    {
      name: 'keyUsage',
      critical: true,
      digitalSignature: true,
      nonRepudiation: true,
    },
    { name: 'extKeyUsage', emailProtection: true },
    { name: 'subjectKeyIdentifier' },
  ]);

  // Sign the certificate with its own key (self-signed), SHA-256.
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
    fingerprint: sha256Hex(binaryStringToBytes(der)),
  };
}

/** A 16-byte random serial as a positive hex string. */
function randomSerial(): string {
  const bytes = forge.random.getBytesSync(16);
  // Force the high bit clear so the ASN.1 INTEGER is unambiguously positive.
  const hex = forge.util.bytesToHex(bytes);
  return (parseInt(hex[0] ?? '0', 16) & 0x8) ? `0${hex.slice(1)}` : hex;
}
