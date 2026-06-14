import { describe, it, expect } from 'vitest';
import { ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import { computeCanonicalPayload, type CredentialContent, type StatusAssertionInput } from '@dmjone/shared';
import { createStatusSigner, createStatusVerifier } from './status.js';
import { bytesToBase64, toUtf8Bytes } from './hash.js';

const seed = new Uint8Array(32).fill(7);
const { secretKey, publicKey } = ml_dsa87.keygen(seed);
const signer = createStatusSigner(secretKey);
const verifier = createStatusVerifier(publicKey);

const input: StatusAssertionInput = {
  credentialId: 'DMJ-IC-20260615-01',
  status: 'revoked',
  asOf: '2026-06-15T10:00:00.000Z',
};

describe('status assertion sign/verify', () => {
  it('round-trips: a signed assertion verifies under the public key', () => {
    expect(verifier.verify(input, signer.sign(input))).toBe(true);
  });

  it('rejects a tampered status', () => {
    const sig = signer.sign(input);
    expect(verifier.verify({ ...input, status: 'valid' }, sig)).toBe(false);
  });

  it('rejects a tampered asOf', () => {
    const sig = signer.sign(input);
    expect(verifier.verify({ ...input, asOf: '2026-06-16T10:00:00.000Z' }, sig)).toBe(false);
  });

  it('rejects a tampered credentialId', () => {
    const sig = signer.sign(input);
    expect(verifier.verify({ ...input, credentialId: 'DMJ-IC-20260615-99' }, sig)).toBe(false);
  });

  it('rejects a signature from a different key', () => {
    const other = ml_dsa87.keygen(new Uint8Array(32).fill(9));
    expect(createStatusVerifier(other.publicKey).verify(input, signer.sign(input))).toBe(false);
  });

  it('never throws on a malformed signature', () => {
    expect(verifier.verify(input, 'not-base64-@@@')).toBe(false);
    expect(verifier.verify(input, '')).toBe(false);
  });

  it('domain separation: a CREDENTIAL signature does not verify as a status assertion', () => {
    const content: CredentialContent = {
      credentialId: input.credentialId,
      type: 'internship',
      issueDate: '2026-06-15',
      kicker: 'Certificate of',
      title: 'INTERNSHIP',
      intro: 'This is to certify that',
      recipientName: 'Test User',
      bodyParagraphs: ['Body.'],
      signatory: { name: 'X', role: 'Y', phone: 'Z' },
    };
    // A signature minted over the bare credential canonical payload...
    const credentialSig = bytesToBase64(
      ml_dsa87.sign(toUtf8Bytes(computeCanonicalPayload(content, 'a'.repeat(64))), secretKey),
    );
    // ...must NOT verify as a status assertion (different signed bytes: the tag).
    expect(verifier.verify(input, credentialSig)).toBe(false);
  });
});
