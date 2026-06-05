/**
 * Firestore-backed {@link CredentialRepository}. Documents live at
 * `credentials/{id}` and hold the canonical record only — the signed PDF bytes
 * are NOT here (they are chunked in the per-kind blob subcollections —
 * cert_chunks / s63_chunks — by the blob store). Behavior mirrors the in-memory
 * impl exactly (same throws, same null-on-miss, same revokedAt invariant,
 * deterministic cursor pagination).
 */

import {
  AppError,
  ERROR_CODE,
  type CredentialRecord,
  type CredentialRepository,
  type CredentialStatus,
} from '@dmjone/shared';
import { FieldPath, type Firestore } from '@google-cloud/firestore';
import { COLLECTIONS } from './paths.js';
import { credentialToRow, rowToCredential, type CredentialRow } from './rows.js';

export function createFirestoreCredentialRepository(db: Firestore): CredentialRepository {
  const col = db.collection(COLLECTIONS.credentials);

  return {
    async create(record: CredentialRecord): Promise<void> {
      try {
        // create() fails if the doc already exists → map to CREDENTIAL_EXISTS.
        await col.doc(record.id).create(credentialToRow(record));
      } catch (err) {
        if (isAlreadyExists(err)) {
          throw new AppError(
            ERROR_CODE.CREDENTIAL_EXISTS,
            `Credential ${record.id} already exists`,
            409,
          );
        }
        throw err;
      }
    },

    async getById(id: string): Promise<CredentialRecord | null> {
      const snap = await col.doc(id).get();
      const data = snap.data() as CredentialRow | undefined;
      return data ? rowToCredential(data) : null;
    },

    async exists(id: string): Promise<boolean> {
      const snap = await col.doc(id).get();
      return snap.exists;
    },

    async setStatus(id: string, status: CredentialStatus, at: string): Promise<void> {
      const ref = col.doc(id);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) {
          throw new AppError(ERROR_CODE.CREDENTIAL_NOT_FOUND, `Credential ${id} not found`, 404);
        }
        const current = rowToCredential(snap.data() as CredentialRow);
        // Enforce the invariant: revokedAt present iff revoked. Drop it first,
        // then set only when revoking, so un-revoking clears it.
        const { revokedAt: _prev, ...rest } = current;
        const next: CredentialRecord = { ...rest, status };
        if (status === 'revoked') next.revokedAt = at;
        // Full overwrite (no merge) so a cleared revokedAt actually disappears.
        tx.set(ref, credentialToRow(next));
      });
    },

    async list(opts?: { limit?: number; cursor?: string }): Promise<{
      items: CredentialRecord[];
      nextCursor?: string;
    }> {
      const limit = opts?.limit ?? 50;
      // Over-fetch by one to detect "is there a next page?" without a dangling
      // cursor at the exact-multiple boundary: a cursor is returned ONLY when a
      // further record genuinely exists (matching the in-memory contract).
      let query = col.orderBy(FieldPath.documentId()).limit(limit + 1);
      if (opts?.cursor !== undefined) query = query.startAfter(opts.cursor);

      const snap = await query.get();
      const hasMore = snap.docs.length > limit;
      const pageDocs = hasMore ? snap.docs.slice(0, limit) : snap.docs;
      const items = pageDocs.map((d) => rowToCredential(d.data() as CredentialRow));

      const lastDoc = pageDocs.at(-1);
      return hasMore && lastDoc !== undefined ? { items, nextCursor: lastDoc.id } : { items };
    },
  };
}

/** Firestore throws a gRPC ALREADY_EXISTS (code 6) when create() hits a dup. */
function isAlreadyExists(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 6;
}
