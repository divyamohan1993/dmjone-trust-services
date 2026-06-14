/**
 * In-memory {@link CredentialRepository}. First-class deliverable: issuer/verify
 * and their tests run on this without GCP. Behavior MUST match the Firestore
 * impl exactly (same throws, same null-on-miss, same pagination semantics).
 *
 * The PDF bytes are NOT stored here — only the canonical record. Bytes live in
 * the {@link BlobStore}. Records are deep-cloned on write and read so callers
 * can never mutate stored state by aliasing.
 */

import {
  AppError,
  ERROR_CODE,
  type CredentialRecord,
  type CredentialRepository,
  type CredentialStatus,
} from '@dmjone/shared';

export function createInMemoryCredentialRepository(): CredentialRepository {
  // Insertion-ordered map → deterministic, stable list() pagination.
  const records = new Map<string, CredentialRecord>();

  return {
    async create(record: CredentialRecord): Promise<void> {
      if (records.has(record.id)) {
        throw new AppError(
          ERROR_CODE.CREDENTIAL_EXISTS,
          `Credential ${record.id} already exists`,
          409,
        );
      }
      records.set(record.id, structuredClone(record));
    },

    async getById(id: string): Promise<CredentialRecord | null> {
      const found = records.get(id);
      return found ? structuredClone(found) : null;
    },

    async exists(id: string): Promise<boolean> {
      return records.has(id);
    },

    async setStatus(
      id: string,
      status: CredentialStatus,
      at: string,
      statusSignature?: { value: string; asOf: string },
    ): Promise<void> {
      const found = records.get(id);
      if (!found) {
        throw new AppError(
          ERROR_CODE.CREDENTIAL_NOT_FOUND,
          `Credential ${id} not found`,
          404,
        );
      }
      // Invariant: revokedAt is present iff status === 'revoked'; statusSignature,
      // if present, matches the CURRENT status. Drop both first, then re-stamp,
      // so un-revoking clears revokedAt and a stale signature never outlives its
      // status (exactOptionalPropertyTypes keeps absent keys omitted).
      const { revokedAt: _prev, statusSignature: _prevSig, ...rest } = structuredClone(found);
      const next: CredentialRecord = { ...rest, status };
      if (status === 'revoked') {
        next.revokedAt = at;
      }
      if (statusSignature !== undefined) {
        next.statusSignature = statusSignature;
      }
      records.set(id, next);
    },

    async list(opts?: { limit?: number; cursor?: string }): Promise<{
      items: CredentialRecord[];
      nextCursor?: string;
    }> {
      const limit = opts?.limit ?? 50;
      // Order by id ascending to match the Firestore impl's orderBy(documentId).
      // This makes pagination identical regardless of insertion order.
      const all = [...records.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

      let startIndex = 0;
      if (opts?.cursor !== undefined) {
        const cursorIndex = all.findIndex((r) => r.id === opts.cursor);
        // Cursor points at the last item of the previous page; resume after it.
        // An unknown cursor yields an empty page rather than restarting.
        startIndex = cursorIndex === -1 ? all.length : cursorIndex + 1;
      }

      const page = all.slice(startIndex, startIndex + limit);
      const items = page.map((r) => structuredClone(r));

      const consumedUpTo = startIndex + page.length;
      const hasMore = consumedUpTo < all.length && page.length === limit;
      const lastId = page.length > 0 ? page[page.length - 1]?.id : undefined;

      return hasMore && lastId !== undefined ? { items, nextCursor: lastId } : { items };
    },
  };
}
