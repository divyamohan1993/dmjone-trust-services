/**
 * In-memory {@link AdminRepository}. Single-admin model (v1): one slot.
 * `save` upserts; `get` returns null until an account exists.
 */

import { canonicalJson, type AdminAccount, type AdminRepository } from '@dmjone/shared';

export function createInMemoryAdminRepository(): AdminRepository {
  let account: AdminAccount | null = null;

  return {
    async get(): Promise<AdminAccount | null> {
      return account ? structuredClone(account) : null;
    },

    async compareAndSave(expected, next) {
      if (canonicalJson(account) !== canonicalJson(expected)) return false;
      account = structuredClone(next);
      return true;
    },

    async save(next: AdminAccount): Promise<void> {
      account = structuredClone(next);
    },
  };
}
