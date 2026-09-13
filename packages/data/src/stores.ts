/**
 * The aggregate persistence surface. Both the in-memory factory
 * ({@link createInMemoryStores}) and the Firestore factory ({@link createFirestoreStores})
 * return this exact shape, so a composition root can swap implementations
 * without touching the issuer/verify wiring.
 */

import type {
  EmailQuotaRepository,
  DocumentDraftRepository,
  AdminRepository,
  AnchorRepository,
  AuditLog,
  BlobStore,
  CredentialRepository,
  LogRepository,
  SecretStore,
} from '@dmjone/shared';

export interface DataStores {
  drafts: DocumentDraftRepository;
  emailQuota: EmailQuotaRepository;
  credentials: CredentialRepository;
  blobs: BlobStore;
  log: LogRepository;
  anchors: AnchorRepository;
  admin: AdminRepository;
  audit: AuditLog;
  secrets: SecretStore;
}
