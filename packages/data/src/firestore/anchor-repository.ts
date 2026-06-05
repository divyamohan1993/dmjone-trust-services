/**
 * Firestore-backed {@link AnchorRepository}. Proofs at `anchors/{headSeq}`.
 * `latest()` returns the proof with the highest head sequence (ordered desc,
 * limit 1). Optional `github` / `opentimestamps` fields are added on read only
 * when present.
 */

import type { AnchorProof, AnchorRepository } from '@dmjone/shared';
import type { Firestore } from '@google-cloud/firestore';
import { COLLECTIONS, seqDocId } from './paths.js';
import { rowToAnchor, type AnchorProofRow } from './rows.js';

export function createFirestoreAnchorRepository(db: Firestore): AnchorRepository {
  const col = db.collection(COLLECTIONS.anchors);

  return {
    async save(proof: AnchorProof): Promise<void> {
      const row: AnchorProofRow = { ...proof };
      await col.doc(seqDocId(proof.headSeq)).set(row);
    },

    async latest(): Promise<AnchorProof | null> {
      const snap = await col.orderBy('headSeq', 'desc').limit(1).get();
      const doc = snap.docs[0];
      return doc ? rowToAnchor(doc.data() as AnchorProofRow) : null;
    },

    async forHead(headSeq: number): Promise<AnchorProof | null> {
      const snap = await col.doc(seqDocId(headSeq)).get();
      const data = snap.data() as AnchorProofRow | undefined;
      return data ? rowToAnchor(data) : null;
    },
  };
}
