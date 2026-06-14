/**
 * The injected collaborator set for the issuer service.
 *
 * Every field is a `@dmjone/shared` interface so this stream typechecks against
 * the locked contracts, never against a sibling implementation. The composition
 * root supplies concrete crypto / data / render objects at integration time.
 */

import type {
  AdminRepository,
  AnchorPublisher,
  AnchorRepository,
  AppEnv,
  AuditLog,
  BlobStore,
  CredentialRepository,
  HybridSigner,
  LogRepository,
  LogSigner,
  PasswordHasher,
  SecretStore,
  Section63Generator,
} from '@dmjone/shared';
// The renderer is typed as @dmjone/render's TrustedDocumentRenderer (the frozen
// CertificateRenderer contract PLUS the Mode-2 `renderLetter` path). The render
// package widens the type there (not in @dmjone/shared, which is frozen), and
// `createCertificateRenderer()` already returns it. The issuer's letter
// issuance (Mode 2) calls `renderer.renderLetter`.
import type { TrustedDocumentRenderer } from '@dmjone/render';
import type { StatusSigner } from '@dmjone/crypto';
import type { Logger } from 'pino';

/**
 * Reversible authenticated encryption for secrets at rest (currently the TOTP
 * secret). The composition root resolves the master key once and injects a
 * concrete implementation; defined here (not imported from the composition
 * root) so the core's dependency arrow never points at orchestrator-owned code.
 * Structural typing unifies the injected concrete with this shape.
 */
export interface SecretSealer {
  sealString(plaintext: string): string;
  openString(sealed: string): string;
}

export interface IssuerDeps {
  env: AppEnv;
  logger: Logger;
  credentialRepo: CredentialRepository;
  blobStore: BlobStore;
  logRepo: LogRepository;
  anchorRepo: AnchorRepository;
  adminRepo: AdminRepository;
  auditLog: AuditLog;
  secretStore: SecretStore;
  signer: HybridSigner;
  logSigner: LogSigner;
  /** Mints domain-tagged ML-DSA status assertions (issue-time + on revoke). */
  statusSigner: StatusSigner;
  anchorPublisher: AnchorPublisher;
  passwordHasher: PasswordHasher;
  renderer: TrustedDocumentRenderer;
  section63: Section63Generator;
  /** Seals/opens the TOTP secret; master key resolved at the composition root. */
  secretSealer: SecretSealer;
}
