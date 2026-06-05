/**
 * Transparency-log append with optimistic-concurrency retry.
 *
 * Appends a leaf for one credential and advances the signed tree head. The
 * append is serialized by the repository under a transaction with optimistic
 * concurrency on the current head; if the head moved under us the repo throws
 * `LOG_CONFLICT` and we recompute from the new head and retry. Any other error
 * (or exhausting retries) is fatal to issuance.
 *
 *   prev          = getHead()
 *   seq           = (prev?.seq ?? 0) + 1
 *   leafHash      = computeLeafHash(canonicalSha256)
 *   prevHeadHash  = prev?.headHash ?? GENESIS_HEAD_HASH
 *   headHash      = computeHeadHash(leafHash, prevHeadHash)
 *   head          = { seq, headHash, prevHeadHash, signature: signHead(headHash), signedAt }
 *   leaf          = { seq, leafHash, credentialId, canonicalSha256, timestamp }
 *   appendLeaf(leaf, head)   // retry on LOG_CONFLICT
 */

import { AppError, ERROR_CODE, GENESIS_HEAD_HASH } from '@dmjone/shared';
import type { LogRepository, LogSigner } from '@dmjone/shared';

/** Bounded retries; the chain is serialized so contention clears quickly. */
const MAX_APPEND_ATTEMPTS = 5;

export interface AppendResult {
  logSeq: number;
  logLeafHash: string;
}

export async function appendToLog(args: {
  logRepo: LogRepository;
  logSigner: LogSigner;
  credentialId: string;
  canonicalSha256: string;
  now: string;
}): Promise<AppendResult> {
  const { logRepo, logSigner, credentialId, canonicalSha256, now } = args;

  let lastConflict: AppError | undefined;
  for (let attempt = 1; attempt <= MAX_APPEND_ATTEMPTS; attempt += 1) {
    const prev = await logRepo.getHead();
    const seq = (prev?.seq ?? 0) + 1;
    const leafHash = logSigner.computeLeafHash(canonicalSha256);
    const prevHeadHash = prev?.headHash ?? GENESIS_HEAD_HASH;
    const headHash = logSigner.computeHeadHash(leafHash, prevHeadHash);

    const head = {
      seq,
      headHash,
      prevHeadHash,
      signature: logSigner.signHead(headHash),
      signedAt: now,
    };
    const leaf = { seq, leafHash, credentialId, canonicalSha256, timestamp: now };

    try {
      await logRepo.appendLeaf(leaf, head);
      return { logSeq: seq, logLeafHash: leafHash };
    } catch (err) {
      if (err instanceof AppError && err.code === ERROR_CODE.LOG_CONFLICT) {
        lastConflict = err;
        continue; // head moved; recompute from the new head and retry
      }
      throw err;
    }
  }

  throw new AppError(
    ERROR_CODE.LOG_APPEND_FAILED,
    `Transparency-log append failed after ${MAX_APPEND_ATTEMPTS} attempts`,
    500,
    lastConflict ? { lastConflictCode: lastConflict.code } : undefined,
  );
}
