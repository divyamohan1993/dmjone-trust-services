/**
 * Firestore + Secret Manager persistence implementations (Stream D, production).
 * Every impl mirrors the in-memory family's behavior exactly. Exposed as factory
 * functions taking an already-constructed Firestore client (dependency
 * injection), plus a `createFirestoreStores(env)` convenience that builds the
 * client and the full {@link DataStores} bundle.
 */

import type { Firestore } from '@google-cloud/firestore';
import type { DataStores } from '../stores.js';
import { createFirestore, type FirestoreEnv } from './client.js';
import { createFirestoreCredentialRepository } from './credential-repository.js';
import { createFirestoreBlobStore } from './blob-store.js';
import { createFirestoreLogRepository } from './log-repository.js';
import { createFirestoreAnchorRepository } from './anchor-repository.js';
import { createFirestoreAdminRepository } from './admin-repository.js';
import { createFirestoreAuditLog } from './audit-log.js';
import { createFirestoreSecretStore } from './secret-store.js';

export { createFirestore, type FirestoreEnv } from './client.js';
export { createFirestoreCredentialRepository } from './credential-repository.js';
export { createFirestoreBlobStore } from './blob-store.js';
export { createFirestoreLogRepository } from './log-repository.js';
export { createFirestoreAnchorRepository } from './anchor-repository.js';
export { createFirestoreAdminRepository } from './admin-repository.js';
export { createFirestoreAuditLog } from './audit-log.js';
export { createFirestoreSecretStore, type SecretStoreOptions } from './secret-store.js';
export { BLOB_CHUNK_COLLECTIONS, COLLECTIONS, DOC_IDS, seqDocId } from './paths.js';

/**
 * Build the complete Firestore-backed store set from validated env. The Secret
 * Manager client is constructed with the same project id; the Firestore client
 * honors the emulator + named-database selectors.
 */
export function createFirestoreStores(env: FirestoreEnv): DataStores {
  const db: Firestore = createFirestore(env);
  return {
    credentials: createFirestoreCredentialRepository(db),
    blobs: createFirestoreBlobStore(db),
    log: createFirestoreLogRepository(db),
    anchors: createFirestoreAnchorRepository(db),
    admin: createFirestoreAdminRepository(db),
    audit: createFirestoreAuditLog(db),
    secrets: createFirestoreSecretStore({ projectId: env.GCP_PROJECT_ID }),
  };
}
