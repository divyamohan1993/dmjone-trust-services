/**
 * Firestore-backed {@link AdminRepository}. Single admin (v1) at `admin/main`.
 * `save` upserts; `get` returns null until set. Encrypted secret fields
 * (totpSecretEnc) are opaque ciphertext to this layer.
 */

import type { AdminAccount, AdminRepository } from '@dmjone/shared';
import type { Firestore } from '@google-cloud/firestore';
import { COLLECTIONS, DOC_IDS } from './paths.js';
import { rowToAdmin, type AdminAccountRow } from './rows.js';

export function createFirestoreAdminRepository(db: Firestore): AdminRepository {
  const ref = db.collection(COLLECTIONS.admin).doc(DOC_IDS.adminMain);

  return {
    async get(): Promise<AdminAccount | null> {
      const snap = await ref.get();
      const data = snap.data() as AdminAccountRow | undefined;
      return data ? rowToAdmin(data) : null;
    },

    async save(account: AdminAccount): Promise<void> {
      const row: AdminAccountRow = { ...account };
      // Full overwrite (no merge) so removed optionals (e.g. cleared lockout)
      // actually disappear from the stored doc.
      await ref.set(row);
    },
  };
}
