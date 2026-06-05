import { GENESIS_HEAD_HASH, type SignedTreeHead } from '@dmjone/shared';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './hash.js';
import { createLogSigner, createLogVerifier, nextHead } from './log.js';
import { makeTestKeys } from './test-helpers.js';

const TS = '2026-06-05T10:00:00.000Z';

/** Sign a pure nextHead() result into a full SignedTreeHead (issuer-side step). */
function signHead(
  signer: ReturnType<typeof createLogSigner>,
  unsigned: Omit<SignedTreeHead, 'signature'>,
): SignedTreeHead {
  return { ...unsigned, signature: signer.signHead(unsigned.headHash) };
}

describe('transparency log hash chain', () => {
  it('links 3 sequential heads and verifies every one', () => {
    const { logSecretKey, logPublicKey } = makeTestKeys();
    const signer = createLogSigner(logSecretKey);
    const verifier = createLogVerifier(logPublicKey);

    const c1 = sha256Hex('payload-1');
    const c2 = sha256Hex('payload-2');
    const c3 = sha256Hex('payload-3');

    const first = nextHead(null, { canonicalSha256: c1, credentialId: 'DMJ-IC-20260605-01', timestamp: TS });
    const head1 = signHead(signer, first.head);
    const second = nextHead(head1, { canonicalSha256: c2, credentialId: 'DMJ-IC-20260605-02', timestamp: TS });
    const head2 = signHead(signer, second.head);
    const third = nextHead(head2, { canonicalSha256: c3, credentialId: 'DMJ-IC-20260605-03', timestamp: TS });
    const head3 = signHead(signer, third.head);

    // Sequence numbers advance 1,2,3.
    expect([head1.seq, head2.seq, head3.seq]).toEqual([1, 2, 3]);

    // First head links to genesis; each subsequent head links to the previous.
    expect(head1.prevHeadHash).toBe(GENESIS_HEAD_HASH);
    expect(head2.prevHeadHash).toBe(head1.headHash);
    expect(head3.prevHeadHash).toBe(head2.headHash);

    // Leaves carry the right seq, credential + canonical hash.
    expect(first.leaf.seq).toBe(1);
    expect(first.leaf.credentialId).toBe('DMJ-IC-20260605-01');
    expect(first.leaf.canonicalSha256).toBe(c1);
    expect(second.leaf.seq).toBe(2);

    // Every signed head verifies.
    expect(verifier.verifyHead(head1)).toBe(true);
    expect(verifier.verifyHead(head2)).toBe(true);
    expect(verifier.verifyHead(head3)).toBe(true);
  });

  it('nextHead is pure: same inputs → identical structure, no signature field', () => {
    const canonicalSha256 = sha256Hex('repeatable');
    const a = nextHead(null, { canonicalSha256, credentialId: 'DMJ-IC-20260605-01', timestamp: TS });
    const b = nextHead(null, { canonicalSha256, credentialId: 'DMJ-IC-20260605-01', timestamp: TS });
    // Deterministic and signature-free (signing is the caller's separate step).
    expect(a).toEqual(b);
    expect('signature' in a.head).toBe(false);
  });

  it('recomputes the chain math independently (leaf and head)', () => {
    const { logPublicKey } = makeTestKeys();
    const verifier = createLogVerifier(logPublicKey);

    const canonicalSha256 = sha256Hex('some-credential');
    const { leaf, head } = nextHead(null, {
      canonicalSha256,
      credentialId: 'DMJ-CC-20260605-01',
      timestamp: '2026-06-05T11:00:00.000Z',
    });

    // leaf = SHA-256(canonicalSha256), head = SHA-256(leaf ‖ genesis).
    expect(leaf.leafHash).toBe(sha256Hex(canonicalSha256));
    expect(head.headHash).toBe(sha256Hex(leaf.leafHash + GENESIS_HEAD_HASH));
    expect(head.prevHeadHash).toBe(GENESIS_HEAD_HASH);
    expect(head.signedAt).toBe('2026-06-05T11:00:00.000Z');
    expect(verifier.computeLeafHash(canonicalSha256)).toBe(leaf.leafHash);
    expect(verifier.computeHeadHash(leaf.leafHash, GENESIS_HEAD_HASH)).toBe(head.headHash);
  });

  it('fails verification when a head is tampered', () => {
    const { logSecretKey, logPublicKey } = makeTestKeys();
    const signer = createLogSigner(logSecretKey);
    const verifier = createLogVerifier(logPublicKey);

    const { head: unsigned } = nextHead(null, {
      canonicalSha256: sha256Hex('x'),
      credentialId: 'DMJ-IC-20260605-09',
      timestamp: TS,
    });
    const head = signHead(signer, unsigned);

    // Genuine signed head verifies.
    expect(verifier.verifyHead(head)).toBe(true);
    // Tamper the head hash → signature no longer matches.
    expect(verifier.verifyHead({ ...head, headHash: sha256Hex('forged') })).toBe(false);
    // Tamper the signature → fails.
    expect(verifier.verifyHead({ ...head, signature: 'AAAA' })).toBe(false);
    // Wrong public key → fails.
    const otherVerifier = createLogVerifier(makeTestKeys().logPublicKey);
    expect(otherVerifier.verifyHead(head)).toBe(false);
  });

  it('the same canonical hash yields a stable leaf hash (determinism)', () => {
    const canonicalSha256 = sha256Hex('repeatable');
    const a = nextHead(null, { canonicalSha256, credentialId: 'DMJ-IC-20260605-01', timestamp: TS });
    const b = nextHead(null, { canonicalSha256, credentialId: 'DMJ-IC-20260605-01', timestamp: TS });
    expect(a.leaf.leafHash).toBe(b.leaf.leafHash);
    expect(a.head.headHash).toBe(b.head.headHash);
  });
});
