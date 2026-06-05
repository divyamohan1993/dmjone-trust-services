/**
 * In-memory {@link AdminRepository}. Single-admin model (v1): one slot.
 * `save` upserts; `get` returns null until an account exists.
 */

import type { AdminAccount, AdminRepository } from '@dmjone/shared';

export function createInMemoryAdminRepository(): AdminRepository {
  let account: AdminAccount | null = null;

  return {
    async get(): Promise<AdminAccount | null> {
      return account ? structuredClone(account) : null;
    },

    async save(next: AdminAccount): Promise<void> {
      account = structuredClone(next);
    },
  };
}
