import { ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import { sha256Hex, toUtf8Bytes } from './hash.js';
import { generateMldsaKeypair, generateSelfSignedPadesCert, mldsaPublicKeyId } from './keys.js';

describe('generateMldsaKeypair', () => {
  it('produces ML-DSA-87 keys of the FIPS 204 sizes', () => {
    const kp = generateMldsaKeypair();
    // ML-DSA-87 (NIST Level 5): public key 2592 bytes, secret key 4896 bytes.
    expect(kp.publicKey.length).toBe(2592);
    expect(kp.secretKey.length).toBe(4896);
  });

  it('derives publicKeyId as the first 16 hex of sha256(publicKey)', () => {
    const kp = generateMldsaKeypair();
    expect(kp.publicKeyId).toBe(sha256Hex(kp.publicKey).slice(0, 16));
    expect(kp.publicKeyId).toMatch(/^[0-9a-f]{16}$/);
    expect(mldsaPublicKeyId(kp.publicKey)).toBe(kp.publicKeyId);
  });

  it('can sign and verify a message with the generated keys', () => {
    const kp = generateMldsaKeypair();
    const msg = toUtf8Bytes('quantum-verifiable');
    const sig = ml_dsa87.sign(msg, kp.secretKey);
    expect(ml_dsa87.verify(sig, msg, kp.publicKey)).toBe(true);
    // A different message must not verify under the same signature.
    expect(ml_dsa87.verify(sig, toUtf8Bytes('tampered'), kp.publicKey)).toBe(false);
  });

  it('generates distinct keypairs on each call', () => {
    const a = generateMldsaKeypair();
    const b = generateMldsaKeypair();
    expect(a.publicKeyId).not.toBe(b.publicKeyId);
  });
});

describe('generateSelfSignedPadesCert', () => {
  it('produces a parseable self-signed certificate with the expected subject', () => {
    const { certPem, keyPem, fingerprint } = generateSelfSignedPadesCert();
    expect(certPem).toContain('BEGIN CERTIFICATE');
    expect(keyPem).toContain('BEGIN RSA PRIVATE KEY');
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);

    const cert = forge.pki.certificateFromPem(certPem);
    const cn = cert.subject.getField('CN');
    expect(cn.value).toBe('dmj.one Trust Services');
    const ou = cert.subject.getField('OU');
    expect(ou.value).toBe('Document Signing');
    const c = cert.subject.getField('C');
    expect(c.value).toBe('IN');

    // Self-signed: issuer hash equals subject hash.
    expect(cert.issuer.hash).toBe(cert.subject.hash);
  });

  it('uses an RSA-3072 key and ~25 year validity', () => {
    const notBefore = new Date('2026-06-05T00:00:00Z');
    const { certPem } = generateSelfSignedPadesCert({ notBefore });
    const cert = forge.pki.certificateFromPem(certPem);

    const rsaPub = cert.publicKey as forge.pki.rsa.PublicKey;
    expect(rsaPub.n.bitLength()).toBe(3072);

    const years = cert.validity.notAfter.getFullYear() - cert.validity.notBefore.getFullYear();
    expect(years).toBe(25);
    expect(cert.validity.notBefore.getTime()).toBe(notBefore.getTime());
  });

  it('fingerprint equals sha256 of the certificate DER', () => {
    const { certPem, fingerprint } = generateSelfSignedPadesCert();
    const cert = forge.pki.certificateFromPem(certPem);
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const bytes = new Uint8Array(der.length);
    for (let i = 0; i < der.length; i += 1) bytes[i] = der.charCodeAt(i) & 0xff;
    expect(fingerprint).toBe(sha256Hex(bytes));
  });

  it('marks keyUsage digitalSignature + nonRepudiation', () => {
    const { certPem } = generateSelfSignedPadesCert();
    const cert = forge.pki.certificateFromPem(certPem);
    const ku = cert.getExtension('keyUsage') as
      | { digitalSignature?: boolean; nonRepudiation?: boolean }
      | undefined;
    expect(ku?.digitalSignature).toBe(true);
    expect(ku?.nonRepudiation).toBe(true);
  });
});
