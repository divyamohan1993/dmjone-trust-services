/**
 * Secret Manager-backed {@link SecretStore}.
 *
 *   - get(name)  → payload of the secret's `latest` version, or null when the
 *                  secret or any enabled version does not exist (NOT_FOUND).
 *   - set(name,v)→ ensure the secret container exists (create if missing,
 *                  tolerate ALREADY_EXISTS), then add a new version holding `v`.
 *                  Secret Manager versions are immutable + append-only, so
 *                  `latest` always returns the most recent set — matching the
 *                  in-memory "latest set wins" semantics.
 *
 * Values are already-encrypted ciphertext as far as this layer is concerned.
 */

import type { SecretStore } from '@dmjone/shared';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

export interface SecretStoreOptions {
  projectId: string;
  /** Injectable for tests; defaults to a real client. */
  client?: SecretManagerServiceClient;
}

const NOT_FOUND = 5;
const ALREADY_EXISTS = 6;

function grpcCode(err: unknown): number | undefined {
  return typeof err === 'object' && err !== null
    ? (err as { code?: number }).code
    : undefined;
}

export function createFirestoreSecretStore(opts: SecretStoreOptions): SecretStore {
  const client = opts.client ?? new SecretManagerServiceClient();
  const parent = `projects/${opts.projectId}`;
  const secretName = (name: string) => `${parent}/secrets/${name}`;

  return {
    async get(name: string): Promise<string | null> {
      try {
        const [resp] = await client.accessSecretVersion({
          name: `${secretName(name)}/versions/latest`,
        });
        const data = resp.payload?.data;
        if (data === null || data === undefined) return null;
        // data is Uint8Array | string depending on transport; normalize.
        return typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
      } catch (err) {
        if (grpcCode(err) === NOT_FOUND) return null;
        throw err;
      }
    },

    async set(name: string, value: string): Promise<void> {
      try {
        await client.createSecret({
          parent,
          secretId: name,
          secret: { replication: { automatic: {} } },
        });
      } catch (err) {
        // A pre-existing secret container is fine — we just add a new version.
        if (grpcCode(err) !== ALREADY_EXISTS) throw err;
      }
      await client.addSecretVersion({
        parent: secretName(name),
        payload: { data: Buffer.from(value, 'utf8') },
      });
    },
  };
}
