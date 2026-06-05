/**
 * In-memory {@link SecretStore}. Mirrors Secret Manager semantics: `get` returns
 * the latest value or null; `set` upserts (each set is conceptually a new
 * version, but only the latest is observable through this interface). Values are
 * already-encrypted ciphertext as far as this layer is concerned — it never
 * inspects them.
 */

import type { SecretStore } from '@dmjone/shared';

export function createInMemorySecretStore(): SecretStore {
  const secrets = new Map<string, string>();

  return {
    async get(name: string): Promise<string | null> {
      return secrets.has(name) ? (secrets.get(name) as string) : null;
    },

    async set(name: string, value: string): Promise<void> {
      secrets.set(name, value);
    },
  };
}
