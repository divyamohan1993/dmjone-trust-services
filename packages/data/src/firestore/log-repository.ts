/**
 * Firestore-backed {@link LogRepository} for the tamper-evident transparency
 * log. The head is a single doc `log/_head`; leaves are `log/{seq}` (zero-padded
 * id so lexical == numeric). Appends run in a Firestore TRANSACTION with
 * optimistic concurrency on the head:
 *
 *   1. read log/_head
 *   2. assert the supplied nextHead's SEQ extends it (empty → seq 1; else
 *      stored.seq + 1) — same seq-only predicate as the in-memory impl. The
 *      repo does NOT validate hash linkage (prevHeadHash); crypto's LogSigner
 *      owns that, and the caller passes the precomputed next head.
 *   3. write the leaf doc + overwrite the head doc, atomically
 *
 * Firestore's transaction gives serializability: if `log/_head` is mutated by a
 * concurrent winner between the read and the commit, the SDK re-runs this
 * function; on re-run the loser sees the advanced head, its seq no longer
 * extends it, and it throws LOG_CONFLICT — the issuer then re-fetches the head,
 * recomputes, and retries. The repo NEVER retries internally (that would
 * persist stale linkage). The chain stays strictly linear and seq monotonic.
 *
 * Error taxonomy:
 *   - LOG_CONFLICT      transient/retryable: seq does not extend the stored head
 *                       (covers seq gaps, head-exists-when-seq===1,
 *                       no-head-when-seq>1).
 *   - LOG_APPEND_FAILED terminal: leaf.seq !== head.seq (inconsistent pair —
 *                       a retry cannot repair it).
 */

import {
  AppError,
  ERROR_CODE,
  type LogLeaf,
  type LogRepository,
  type SignedTreeHead,
} from '@dmjone/shared';
import type { Firestore } from '@google-cloud/firestore';
import { COLLECTIONS, DOC_IDS, seqDocId } from './paths.js';
import { rowToHead, rowToLeaf, type LogLeafRow, type SignedTreeHeadRow } from './rows.js';

export function createFirestoreLogRepository(db: Firestore): LogRepository {
  const logCol = db.collection(COLLECTIONS.log);
  const headRef = logCol.doc(DOC_IDS.logHead);

  function leafRef(seq: number) {
    return logCol.doc(seqDocId(seq));
  }

  /** Throws LOG_CONFLICT when `next.seq` does not extend the stored head. */
  function assertSeqExtends(stored: SignedTreeHead | null, next: SignedTreeHead): void {
    const expected = stored === null ? 1 : stored.seq + 1;
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
      const snap = await headRef.get();
      const data = snap.data() as SignedTreeHeadRow | undefined;
      return data ? rowToHead(data) : null;
    },

    async appendLeaf(leaf: LogLeaf, nextHead: SignedTreeHead): Promise<void> {
      // Terminal first: an inconsistent leaf+head pair is a caller bug, not a
      // concurrency miss — re-fetching the head cannot repair it.
      if (leaf.seq !== nextHead.seq) {
        throw new AppError(
          ERROR_CODE.LOG_APPEND_FAILED,
          `leaf seq ${leaf.seq} must equal head seq ${nextHead.seq}`,
          409,
        );
      }
      await db.runTransaction(async (tx) => {
        const headSnap = await tx.get(headRef);
        const stored = headSnap.exists
          ? rowToHead(headSnap.data() as SignedTreeHeadRow)
          : null;
        assertSeqExtends(stored, nextHead);

        const leafRow: LogLeafRow = { ...leaf };
        const headRow: SignedTreeHeadRow = { ...nextHead };
        // create() the leaf so a duplicate seq aborts the tx defensively.
        tx.create(leafRef(leaf.seq), leafRow);
        tx.set(headRef, headRow);
      });
    },

    async getLeaf(seq: number): Promise<LogLeaf | null> {
      const snap = await leafRef(seq).get();
      const data = snap.data() as LogLeafRow | undefined;
      return data ? rowToLeaf(data) : null;
    },

    async getLeafByCredential(credentialId: string): Promise<LogLeaf | null> {
      const snap = await logCol.where('credentialId', '==', credentialId).limit(1).get();
      const doc = snap.docs[0];
      return doc ? rowToLeaf(doc.data() as LogLeafRow) : null;
    },

    async listLeaves(fromSeq: number, toSeq: number): Promise<LogLeaf[]> {
      if (toSeq < fromSeq) return [];
      const snap = await logCol
        .where('seq', '>=', fromSeq)
        .where('seq', '<=', toSeq)
        .orderBy('seq')
        .get();
      // The head doc (`_head`) lives in the same collection and shares the
      // latest leaf's seq, so exclude it explicitly.
      return snap.docs
        .filter((d) => d.id !== DOC_IDS.logHead)
        .map((d) => rowToLeaf(d.data() as LogLeafRow));
    },
  };
}
