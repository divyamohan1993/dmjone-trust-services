/**
 * In-memory {@link LogRepository} for the tamper-evident transparency log.
 *
 * Even in memory this enforces real optimistic-concurrency semantics: an append
 * is accepted only if the supplied head's sequence correctly extends the
 * currently-stored head. The repository does NOT validate hash linkage
 * (prevHeadHash) — that is the crypto stream's LogSigner; the caller passes the
 * precomputed next head. The seq check alone is the concurrency guard:
 *
 *   - empty chain  → require head.seq === 1     (else the chain moved)
 *   - otherwise    → require head.seq === stored.seq + 1
 *
 * Error taxonomy (matters for the issuer's retry loop):
 *   - LOG_CONFLICT (transient, RETRYABLE): the head moved under the caller — a
 *     concurrent winner advanced stored.seq, so the loser's head.seq no longer
 *     equals stored.seq + 1 (covers seq gaps and "head exists when seq===1" and
 *     "no head when seq>1"). The issuer re-fetches the head, recomputes the next
 *     head off it, and retries. The repo NEVER retries internally (that would
 *     persist stale linkage).
 *   - LOG_APPEND_FAILED (terminal, NOT retryable): leaf.seq !== head.seq — the
 *     caller assembled an inconsistent leaf+head pair; re-fetching can't fix it.
 */

import {
  AppError,
  ERROR_CODE,
  type LogLeaf,
  type LogRepository,
  type SignedTreeHead,
} from '@dmjone/shared';

export function createInMemoryLogRepository(): LogRepository {
  const leaves = new Map<number, LogLeaf>();
  const byCredential = new Map<string, number>();
  let head: SignedTreeHead | null = null;

  /** Throws LOG_CONFLICT when `next.seq` does not extend the stored head. */
  function assertSeqExtends(next: SignedTreeHead): void {
    const expected = head === null ? 1 : head.seq + 1;
    if (next.seq !== expected) {
      throw new AppError(
        ERROR_CODE.LOG_CONFLICT,
        `log head moved: expected seq ${expected}, got ${next.seq}`,
        409,
      );
    }
  }

  return {
    async getHead(): Promise<SignedTreeHead | null> {
      return head ? structuredClone(head) : null;
    },

    async appendLeaf(leaf: LogLeaf, nextHead: SignedTreeHead): Promise<void> {
      // Terminal first: an inconsistent leaf+head pair is a caller bug, not a
      // concurrency miss — a retry with a re-fetched head cannot repair it.
      if (leaf.seq !== nextHead.seq) {
        throw new AppError(
          ERROR_CODE.LOG_APPEND_FAILED,
          `leaf seq ${leaf.seq} must equal head seq ${nextHead.seq}`,
          409,
        );
      }
      assertSeqExtends(nextHead);
      leaves.set(leaf.seq, structuredClone(leaf));
      byCredential.set(leaf.credentialId, leaf.seq);
      head = structuredClone(nextHead);
    },

    async getLeaf(seq: number): Promise<LogLeaf | null> {
      const found = leaves.get(seq);
      return found ? structuredClone(found) : null;
    },

    async getLeafByCredential(credentialId: string): Promise<LogLeaf | null> {
      const seq = byCredential.get(credentialId);
      if (seq === undefined) return null;
      const found = leaves.get(seq);
      return found ? structuredClone(found) : null;
    },

    async listLeaves(fromSeq: number, toSeq: number): Promise<LogLeaf[]> {
      const out: LogLeaf[] = [];
      for (let seq = fromSeq; seq <= toSeq; seq++) {
        const found = leaves.get(seq);
        if (found) out.push(structuredClone(found));
      }
      return out;
    },
  };
}
