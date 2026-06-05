/**
 * @dmjone/data — persistence layer (Stream D).
 *
 * Implements the @dmjone/shared repository interfaces (CredentialRepository,
 * BlobStore, LogRepository, AnchorRepository, AdminRepository, AuditLog,
 * SecretStore) twice: a Firestore + Secret Manager backed family for production,
 * and a behaviorally-identical in-memory family that issuer/verify and their
 * tests run on without GCP. Everything is exposed as factory functions
 * (dependency injection); nothing here is a singleton.
 */

// Aggregate shape returned by both store families.
export type { DataStores } from './stores.js';

// Boundary serialization helpers (Uint8Array ↔ base64, audit canonicalization).
export {
  base64ToBytes,
  bytesToBase64,
  concatChunks,
  splitIntoChunks,
  sha256Hex,
  auditEventCanonical,
  auditEventHash,
} from './serialization.js';

// In-memory implementations (first-class deliverable).
export * from './in-memory/index.js';

// Firestore + Secret Manager implementations (production).
export * from './firestore/index.js';
