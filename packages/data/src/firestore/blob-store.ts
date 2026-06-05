/**
 * Firestore-backed chunked {@link BlobStore}. A credential has up to two stored
 * blobs distinguished by {@link BlobKind} ('certificate' = the signed PDF,
 * 'section63' = its §63 certificate-of-authenticity). Each kind lives in its OWN
 * subcollection under the credential doc — `credentials/{id}/cert_chunks` and
 * `credentials/{id}/s63_chunks` — so the two blobs are fully independent and the
 * `get()` ordering query is a single-field `orderBy('n')` with no `where`
 * filter, needing NO composite Firestore index.
 *
 * Each chunk is ≤ PDF_CHUNK_SIZE_BYTES raw → one base64 string per doc, keeping
 * every document well under the 1 MiB limit (a ~600 KB PDF is 3 chunks). `put`
 * clears the prior chunks of THAT kind first, so re-putting a smaller blob
 * leaves no stale tail and never touches the other kind. `get` reassembles the
 * ordered chunks into one Uint8Array; missing → null.
 */

import { PDF_CHUNK_SIZE_BYTES, type BlobKind, type BlobStore } from '@dmjone/shared';
import type { CollectionReference, Firestore } from '@google-cloud/firestore';
import { base64ToBytes, bytesToBase64, concatChunks, splitIntoChunks } from '../serialization.js';
import { BLOB_CHUNK_COLLECTIONS, COLLECTIONS } from './paths.js';
import type { PdfChunkRow } from './rows.js';

export function createFirestoreBlobStore(
  db: Firestore,
  chunkSize: number = PDF_CHUNK_SIZE_BYTES,
): BlobStore {
  function chunksCol(credentialId: string, kind: BlobKind): CollectionReference {
    return db
      .collection(COLLECTIONS.credentials)
      .doc(credentialId)
      .collection(BLOB_CHUNK_COLLECTIONS[kind]);
  }

  return {
    async put(credentialId: string, kind: BlobKind, bytes: Uint8Array): Promise<void> {
      const col = chunksCol(credentialId, kind);

      // Clear this kind's existing chunks (its own subcollection; the other kind
      // is untouched), so a smaller re-put can't leave a stale tail.
      const existing = await col.listDocuments();
      const slices = splitIntoChunks(bytes, chunkSize);

      const batch = db.batch();
      for (const ref of existing) batch.delete(ref);
      slices.forEach((slice, n) => {
        const row: PdfChunkRow = { n, data: bytesToBase64(slice) };
        // Zero-padded doc id keeps listing tidy; correctness relies on `n`.
        batch.set(col.doc(String(n).padStart(6, '0')), row);
      });
      await batch.commit();
    },

    async get(credentialId: string, kind: BlobKind): Promise<Uint8Array | null> {
      // One kind per subcollection → single-field orderBy('n'), no where filter,
      // hence no composite index required.
      const snap = await chunksCol(credentialId, kind).orderBy('n').get();
      if (snap.empty) return null;
      const chunks = snap.docs.map((d) => base64ToBytes((d.data() as PdfChunkRow).data));
      return concatChunks(chunks);
    },
  };
}
