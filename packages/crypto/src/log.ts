/**
 * Transparency log cryptography — the tamper-evident append-only hash chain.
 *
 *   leaf_n = SHA-256(canonicalSha256_n)
 *   head_n = SHA-256(leaf_n ‖ head_{n-1})         (head_0 = GENESIS_HEAD_HASH)
 *
 * Each head is a Signed Tree Head: the running chain digest, ML-DSA-65 signed.
 * Anyone with the log public key can replay the chain and verify every head, so
 * the issuer cannot silently rewrite or back-date history.
 *
 * This module is pure cryptography + math — NO persistence. The Firestore
 * transaction that serialises appends (and the LOG_CONFLICT recompute/retry)
 * lives in the issuer over {@link LogRepository}; the issuer rebuilds the head
 * inside its retry loop from the three primitives below, which is why signing is
 * kept separate from {@link nextHead}. The hashing functions are also reused by
 * the audit log.
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import {
  GENESIS_HEAD_HASH,
  type LogLeaf,
  type LogSigner,
  type LogVerifier,
  type SignedTreeHead,
} from '@dmjone/shared';
import { base64ToBytes, bytesToBase64, sha256Hex, toUtf8Bytes } from './hash.js';

/** leaf = SHA-256(canonicalSha256). Pure; shared by signer and verifier. */
function computeLeafHash(canonicalSha256: string): string {
  return sha256Hex(canonicalSha256);
}

/** head = SHA-256(leafHash ‖ prevHeadHash). Pure; shared by signer and verifier. */
function computeHeadHash(leafHash: string, prevHeadHash: string): string {
  return sha256Hex(leafHash + prevHeadHash);
}

/** Inputs needed to advance the chain by one leaf. */
export interface NextHeadInput {
  canonicalSha256: string;
  credentialId: string;
  /** ISO-8601 timestamp; injected (required) so the function stays pure. */
  timestamp: string;
}

/** The next leaf plus the next head's structure, BEFORE it is signed. */
export interface NextHeadResult {
  leaf: LogLeaf;
  /** The head with everything except `signature`; the caller signs `headHash`. */
  head: Omit<SignedTreeHead, 'signature'>;
}

/**
 * Pure chain-advancement math: derive the next leaf and the next head's
 * structure from the previous head (or null for genesis). seq = prev.seq + 1, or
 * 1 for the first leaf; prevHeadHash = prev.headHash or GENESIS_HEAD_HASH.
 *
 * It does NOT sign — the returned head omits `signature`. The caller signs
 * `head.headHash` via {@link LogSigner.signHead} to obtain a full
 * {@link SignedTreeHead}. Keeping signing out makes this deterministic and
 * side-effect-free (ML-DSA signing is randomized), and lets the issuer recompute
 * it cheaply inside its optimistic-concurrency retry loop against the current head.
 */
export function nextHead(prevHead: SignedTreeHead | null, input: NextHeadInput): NextHeadResult {
  const seq = prevHead ? prevHead.seq + 1 : 1;
  const prevHeadHash = prevHead ? prevHead.headHash : GENESIS_HEAD_HASH;

  const leafHash = computeLeafHash(input.canonicalSha256);
  const headHash = computeHeadHash(leafHash, prevHeadHash);

  const leaf: LogLeaf = {
    seq,
    leafHash,
    credentialId: input.credentialId,
    canonicalSha256: input.canonicalSha256,
    timestamp: input.timestamp,
  };
  const head: Omit<SignedTreeHead, 'signature'> = {
    seq,
    headHash,
    prevHeadHash,
    signedAt: input.timestamp,
  };
  return { leaf, head };
}

/**
 * Issuer-side log signer (holds the log secret key). The keyless verify service
 * never constructs this. The log key is just another ML-DSA-65 keypair, provided
 * as raw bytes by the composition root.
 */
export function createLogSigner(logSecretKey: Uint8Array): LogSigner {
  return {
    computeLeafHash,
    computeHeadHash,
    signHead(headHash: string): string {
      return bytesToBase64(ml_dsa65.sign(toUtf8Bytes(headHash), logSecretKey));
    },
  };
}

/** Verify-side log verifier (public key only). */
export function createLogVerifier(logPublicKey: Uint8Array): LogVerifier {
  return {
    computeLeafHash,
    computeHeadHash,
    verifyHead(head: SignedTreeHead): boolean {
      try {
        return ml_dsa65.verify(base64ToBytes(head.signature), toUtf8Bytes(head.headHash), logPublicKey);
      } catch {
        return false;
      }
    },
  };
}
