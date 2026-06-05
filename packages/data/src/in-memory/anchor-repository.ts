/**
 * In-memory {@link AnchorRepository}. Stores external-anchor proofs keyed by the
 * head sequence they attest. `latest()` returns the proof for the highest head
 * sequence seen (anchors arrive in head order but we don't rely on insertion
 * order for correctness).
 */

import type { AnchorProof, AnchorRepository } from '@dmjone/shared';

export function createInMemoryAnchorRepository(): AnchorRepository {
  const proofs = new Map<number, AnchorProof>();

  return {
    async save(proof: AnchorProof): Promise<void> {
      proofs.set(proof.headSeq, structuredClone(proof));
    },

    async latest(): Promise<AnchorProof | null> {
      if (proofs.size === 0) return null;
      const maxSeq = Math.max(...proofs.keys());
      const found = proofs.get(maxSeq);
      return found ? structuredClone(found) : null;
    },

    async forHead(headSeq: number): Promise<AnchorProof | null> {
      const found = proofs.get(headSeq);
      return found ? structuredClone(found) : null;
    },
  };
}
