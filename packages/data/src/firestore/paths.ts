/**
 * Single source of truth for Firestore collection/document paths, matching the
 * data model in the system design (§8). Keeping them here prevents path drift
 * between repositories.
 */

import type { BlobKind } from '@dmjone/shared';

export const COLLECTIONS = {
  credentials: 'credentials',
  log: 'log',
  anchors: 'anchors',
  admin: 'admin',
  audit: 'audit',
} as const;

/**
 * Per-kind subcollections (under a credential doc) holding that blob's ordered
 * base64 chunks. One subcollection per {@link BlobKind} keeps each blob's chunk
 * set independent and makes `get()` a single-field `orderBy('n')` query with no
 * `where` filter — so it needs no composite Firestore index.
 */
export const BLOB_CHUNK_COLLECTIONS = {
  certificate: 'cert_chunks',
  section63: 's63_chunks',
} as const satisfies Record<BlobKind, string>;

/** Fixed document ids for singletons / chain heads. */
export const DOC_IDS = {
  /** The transparency-log head document (`log/_head`). */
  logHead: '_head',
  /** The audit-chain head pointer document (`audit/_head`). */
  auditHead: '_head',
  /** The single admin account (`admin/main`). */
  adminMain: 'main',
} as const;

/** Zero-padded sequence id so lexical and numeric ordering agree (`audit/{seq}`). */
export function seqDocId(seq: number): string {
  return String(seq).padStart(12, '0');
}
