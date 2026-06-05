/**
 * In-memory persistence implementations (Stream D). First-class deliverables:
 * issuer/verify and their tests run entirely on these without GCP. Every impl
 * mirrors the Firestore behavior exactly (same throws, same null-on-miss, same
 * optimistic-concurrency and hash-chain semantics).
 */

import type { DataStores } from '../stores.js';
import { createInMemoryCredentialRepository } from './credential-repository.js';
import { createInMemoryBlobStore } from './blob-store.js';
import { createInMemoryLogRepository } from './log-repository.js';
import { createInMemoryAnchorRepository } from './anchor-repository.js';
import { createInMemoryAdminRepository } from './admin-repository.js';
import { createInMemoryAuditLog } from './audit-log.js';
import { createInMemorySecretStore } from './secret-store.js';

export { createInMemoryCredentialRepository } from './credential-repository.js';
export { createInMemoryBlobStore } from './blob-store.js';
export { createInMemoryLogRepository } from './log-repository.js';
export { createInMemoryAnchorRepository } from './anchor-repository.js';
export { createInMemoryAdminRepository } from './admin-repository.js';
export { createInMemoryAuditLog } from './audit-log.js';
export { createInMemorySecretStore } from './secret-store.js';

/** Construct a complete, independent set of in-memory stores. */
export function createInMemoryStores(): DataStores {
  return {
    credentials: createInMemoryCredentialRepository(),
    blobs: createInMemoryBlobStore(),
    log: createInMemoryLogRepository(),
    anchors: createInMemoryAnchorRepository(),
    admin: createInMemoryAdminRepository(),
    audit: createInMemoryAuditLog(),
    secrets: createInMemorySecretStore(),
  };
}
