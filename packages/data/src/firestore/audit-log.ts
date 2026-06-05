/**
 * Firestore-backed {@link AuditLog}. Tamper-evident, hash-chained events at
 * `audit/{seq}` (zero-padded id so lexical == numeric). Each event's `hash` is
 * SHA-256 over the canonical form of every field except `hash` (incl. prevHash)
 * via the shared {@link auditEventHash} — the SAME function `verify()` uses, so
 * any altered field or broken link yields false.
 *
 * `append` runs in a TRANSACTION using the SAME concurrency rule as the
 * transparency log: a single head pointer doc `audit/_head` holds `{ seq, hash }`
 * of the latest event. The transaction reads `_head`, derives the next event,
 * then writes BOTH the new event doc and the updated `_head`. Because every
 * append reads and overwrites the same `_head` doc, two concurrent appends
 * conflict deterministically: Firestore aborts and re-runs the loser, which
 * re-reads the advanced head and chains correctly. The chain therefore stays
 * strictly serialized on the previous event's hash.
 */

import { GENESIS_HEAD_HASH, type AuditEvent, type AuditLog } from '@dmjone/shared';
import type { Firestore } from '@google-cloud/firestore';
import { auditEventHash } from '../serialization.js';
import { COLLECTIONS, DOC_IDS, seqDocId } from './paths.js';
import { rowToAudit, type AuditEventRow } from './rows.js';

/** The `audit/_head` pointer doc. */
interface AuditHeadRow {
  seq: number;
  hash: string;
}

export function createFirestoreAuditLog(db: Firestore): AuditLog {
  const col = db.collection(COLLECTIONS.audit);
  const headRef = col.doc(DOC_IDS.auditHead);

  return {
    async append(
      input: Omit<AuditEvent, 'id' | 'prevHash' | 'hash' | 'at'> & { at?: string },
    ): Promise<AuditEvent> {
      const at = input.at ?? new Date().toISOString();

      return db.runTransaction(async (tx) => {
        const headSnap = await tx.get(headRef);
        const head = headSnap.data() as AuditHeadRow | undefined;
        const seq = (head?.seq ?? 0) + 1;
        const prevHash = head?.hash ?? GENESIS_HEAD_HASH;

        const withoutHash: Omit<AuditEvent, 'hash'> = {
          id: String(seq),
          at,
          actor: input.actor,
          action: input.action,
          prevHash,
        };
        if (input.subject !== undefined) withoutHash.subject = input.subject;
        if (input.requestId !== undefined) withoutHash.requestId = input.requestId;
        if (input.meta !== undefined) withoutHash.meta = input.meta;

        const event: AuditEvent = { ...withoutHash, hash: auditEventHash(withoutHash) };
        // `seq` is persisted on the event doc for deterministic ordering; it is
        // NOT part of the hashed event (the chain hash covers exactly the
        // AuditEvent fields).
        const row: AuditEventRow = { ...event, seq };
        // create() the event doc (defensive: a duplicate seq aborts the tx) and
        // advance the single head pointer that serializes concurrent appends.
        tx.create(col.doc(seqDocId(seq)), row);
        tx.set(headRef, { seq, hash: event.hash } satisfies AuditHeadRow);
        return event;
      });
    },

    async verify(): Promise<boolean> {
      const snap = await col.orderBy('seq', 'asc').get();
      let expectedPrev = GENESIS_HEAD_HASH;
      for (const doc of snap.docs) {
        // The head pointer doc (`_head`) lives in the same collection but has no
        // `seq`-ordered event payload to hash; skip it. (It carries a `seq`
        // field too, so filter by id, not by field presence.)
        if (doc.id === DOC_IDS.auditHead) continue;
        const event = rowToAudit(doc.data() as AuditEventRow);
        if (event.prevHash !== expectedPrev) return false;
        const { hash, ...rest } = event;
        if (auditEventHash(rest) !== hash) return false;
        expectedPrev = event.hash;
      }
      return true;
    },
  };
}
