/**
 * In-line fakes of the `@dmjone/shared` interfaces the issuer consumes.
 *
 * These are deliberately minimal — fixed bytes / values, in-memory maps — and
 * record an ordered `calls` trace so tests can assert the issuance pipeline
 * runs render → sign → log-append → store(cert) → store(section63) → audit in
 * the exact required order. No real crypto, network, or persistence.
 */

import { GENESIS_HEAD_HASH } from '@dmjone/shared';
import type {
  AdminAccount,
  AdminRepository,
  AnchorProof,
  AnchorPublisher,
  AnchorRepository,
  AppEnv,
  AuditEvent,
  AuditLog,
  BlobKind,
  BlobStore,
  CredentialContent,
  CredentialRecord,
  CredentialRepository,
  CredentialStatus,
  HybridSignatureResult,
  HybridSigner,
  LetterContent,
  LogLeaf,
  LogRepository,
  LogSigner,
  PasswordHasher,
  RenderOptions,
  SecretStore,
  Section63Generator,
  Section63Metadata,
  SignedTreeHead,
} from '@dmjone/shared';
import type { TrustedDocumentRenderer } from '@dmjone/render';
import type { Logger } from 'pino';

import type { IssuerDeps, SecretSealer } from '../src/deps.js';

/** Shared, ordered call trace across all fakes for one test. */
export type CallTrace = string[];

export class FakeCredentialRepo implements CredentialRepository {
  readonly records = new Map<string, CredentialRecord>();
  createCount = 0;

  async create(record: CredentialRecord): Promise<void> {
    this.records.set(record.id, structuredClone(record));
    this.createCount += 1;
  }
  async getById(id: string): Promise<CredentialRecord | null> {
    const r = this.records.get(id);
    return r ? structuredClone(r) : null;
  }
  async exists(id: string): Promise<boolean> {
    return this.records.has(id);
  }
  async setStatus(id: string, status: CredentialStatus, at: string): Promise<void> {
    const r = this.records.get(id);
    if (!r) return;
    r.status = status;
    if (status === 'revoked') r.revokedAt = at;
  }
  async list(opts?: { limit?: number; cursor?: string }): Promise<{
    items: CredentialRecord[];
    nextCursor?: string;
  }> {
    void opts;
    return { items: [...this.records.values()].map((r) => structuredClone(r)) };
  }
}

export class FakeBlobStore implements BlobStore {
  readonly blobs = new Map<string, Uint8Array>();
  constructor(private readonly trace?: CallTrace) {}
  private key(id: string, kind: BlobKind): string {
    return `${id}:${kind}`;
  }
  async put(credentialId: string, kind: BlobKind, bytes: Uint8Array): Promise<void> {
    this.trace?.push(`put:${kind}`);
    this.blobs.set(this.key(credentialId, kind), bytes);
  }
  async get(credentialId: string, kind: BlobKind): Promise<Uint8Array | null> {
    return this.blobs.get(this.key(credentialId, kind)) ?? null;
  }
}

export class FakeLogRepo implements LogRepository {
  head: SignedTreeHead | null = null;
  readonly leaves: LogLeaf[] = [];
  /** When > 0, the next N appendLeaf calls throw LOG_CONFLICT before succeeding. */
  conflictsRemaining = 0;
  appendAttempts = 0;
  constructor(
    private readonly trace?: CallTrace,
    private readonly conflictError?: () => Error,
  ) {}

  async getHead(): Promise<SignedTreeHead | null> {
    return this.head ? structuredClone(this.head) : null;
  }
  async appendLeaf(leaf: LogLeaf, head: SignedTreeHead): Promise<void> {
    this.appendAttempts += 1;
    if (this.conflictsRemaining > 0 && this.conflictError) {
      this.conflictsRemaining -= 1;
      throw this.conflictError();
    }
    this.trace?.push('logAppend');
    this.leaves.push(structuredClone(leaf));
    this.head = structuredClone(head);
  }
  async getLeaf(seq: number): Promise<LogLeaf | null> {
    return this.leaves.find((l) => l.seq === seq) ?? null;
  }
  async getLeafByCredential(credentialId: string): Promise<LogLeaf | null> {
    return this.leaves.find((l) => l.credentialId === credentialId) ?? null;
  }
  async listLeaves(fromSeq: number, toSeq: number): Promise<LogLeaf[]> {
    return this.leaves.filter((l) => l.seq >= fromSeq && l.seq <= toSeq);
  }
}

export class FakeAnchorRepo implements AnchorRepository {
  readonly proofs: AnchorProof[] = [];
  async save(proof: AnchorProof): Promise<void> {
    this.proofs.push(structuredClone(proof));
  }
  async latest(): Promise<AnchorProof | null> {
    return this.proofs.at(-1) ?? null;
  }
  async forHead(headSeq: number): Promise<AnchorProof | null> {
    return this.proofs.find((p) => p.headSeq === headSeq) ?? null;
  }
}

export class FakeAdminRepo implements AdminRepository {
  account: AdminAccount | null = null;
  async get(): Promise<AdminAccount | null> {
    return this.account ? structuredClone(this.account) : null;
  }
  async save(account: AdminAccount): Promise<void> {
    this.account = structuredClone(account);
  }
}

export class FakeAuditLog implements AuditLog {
  readonly events: AuditEvent[] = [];
  constructor(private readonly trace?: CallTrace) {}
  async append(
    event: Omit<AuditEvent, 'id' | 'prevHash' | 'hash' | 'at'> & { at?: string },
  ): Promise<AuditEvent> {
    this.trace?.push('audit');
    const full: AuditEvent = {
      id: `audit-${this.events.length + 1}`,
      at: event.at ?? new Date().toISOString(),
      actor: event.actor,
      action: event.action,
      prevHash: this.events.at(-1)?.hash ?? GENESIS_HEAD_HASH,
      hash: `hash-${this.events.length + 1}`,
      ...(event.subject !== undefined && { subject: event.subject }),
      ...(event.requestId !== undefined && { requestId: event.requestId }),
      ...(event.meta !== undefined && { meta: event.meta }),
    };
    this.events.push(full);
    return structuredClone(full);
  }
  async verify(): Promise<boolean> {
    return true;
  }
}

/** Deterministic, pure seal/open round-trip (instance-independent). */
export class FakeSecretSealer implements SecretSealer {
  sealString(plaintext: string): string {
    return `sealed:${Buffer.from(plaintext, 'utf8').toString('base64')}`;
  }
  openString(sealed: string): string {
    if (!sealed.startsWith('sealed:')) throw new Error('fake sealer: bad blob');
    return Buffer.from(sealed.slice('sealed:'.length), 'base64').toString('utf8');
  }
}

export class FakeSecretStore implements SecretStore {
  readonly secrets = new Map<string, string>();
  async get(name: string): Promise<string | null> {
    return this.secrets.get(name) ?? null;
  }
  async set(name: string, value: string): Promise<void> {
    this.secrets.set(name, value);
  }
}

export class FakeSigner implements HybridSigner {
  /**
   * Optional RFC-3161 token to attach to the result, modelling a reachable TSA.
   * Default (`undefined`) keeps the result token-free — the steady state when no
   * TSA is configured — so existing tests stay unchanged and the omit-on-absent
   * record path is exercised by default.
   */
  constructor(
    private readonly trace?: CallTrace,
    private readonly tsaTimestampToken?: string,
  ) {}
  async sign(
    unsignedPdf: Uint8Array,
    buildCanonicalPayload: (pdfSha256: string) => string,
  ): Promise<HybridSignatureResult> {
    this.trace?.push('sign');
    void unsignedPdf;
    // Exercise the builder with the fixed pdf hash this fake "produces", so the
    // call-site contract (sign supplies pdfSha256 → builder) is honoured; the
    // returned record values stay fixed for deterministic assertions.
    void buildCanonicalPayload('a'.repeat(64));
    return {
      signedPdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // "%PDF"
      pdfSha256: 'a'.repeat(64),
      canonicalPayload: '{"v":1}',
      canonicalSha256: 'b'.repeat(64),
      mldsaSignature: 'c2lnbmF0dXJl',
      mldsaPublicKeyId: 'mldsa-key-1',
      padesCertFingerprint: 'd'.repeat(64),
      // Only present when a token was injected — mirrors the real signer, which
      // omits the field unless a TSA actually returned a token.
      ...(this.tsaTimestampToken !== undefined && {
        tsaTimestampToken: this.tsaTimestampToken,
      }),
    };
  }
}

export class FakeLogSigner implements LogSigner {
  computeLeafHash(canonicalSha256: string): string {
    return `leaf(${canonicalSha256})`;
  }
  computeHeadHash(leafHash: string, prevHeadHash: string): string {
    return `head(${leafHash},${prevHeadHash})`;
  }
  signHead(headHash: string): string {
    return `sth(${headHash})`;
  }
}

export class FakeAnchorPublisher implements AnchorPublisher {
  shouldFail = false;
  published: SignedTreeHead[] = [];
  async publish(head: SignedTreeHead): Promise<AnchorProof> {
    if (this.shouldFail) throw new Error('anchor unavailable');
    this.published.push(structuredClone(head));
    return {
      headSeq: head.seq,
      headHash: head.headHash,
      github: { repo: 'dmjone/anchor', commitSha: 'deadbeef', url: 'https://example/commit' },
      anchoredAt: new Date().toISOString(),
    };
  }
}

export class FakePasswordHasher implements PasswordHasher {
  readonly hashed: string[] = [];
  async hash(password: string): Promise<string> {
    this.hashed.push(password);
    return `$argon2id$fake$${password}`;
  }
  async verify(password: string, stored: string): Promise<boolean> {
    return stored === `$argon2id$fake$${password}`;
  }
}

export class FakeRenderer implements TrustedDocumentRenderer {
  /** Last opts seen by `render` (cert path). */
  lastOpts: RenderOptions | null = null;
  /** Last opts seen by `renderLetter` (letter path) — lets letter tests assert the QR url. */
  lastLetterOpts: RenderOptions | null = null;
  constructor(private readonly trace?: CallTrace) {}
  async render(content: CredentialContent, opts: RenderOptions): Promise<Uint8Array> {
    this.trace?.push('render');
    void content;
    this.lastOpts = opts;
    return new Uint8Array([0x75, 0x6e, 0x73, 0x67]); // "unsg" (unsigned)
  }
  async renderLetter(content: LetterContent, opts: RenderOptions): Promise<Uint8Array> {
    this.trace?.push('renderLetter');
    void content;
    this.lastLetterOpts = opts;
    return new Uint8Array([0x6c, 0x74, 0x72, 0x75]); // "ltru" (letter, unsigned)
  }
}

export class FakeSection63 implements Section63Generator {
  constructor(private readonly trace?: CallTrace) {}
  metadata(content: CredentialContent, pdfSha256: string): Section63Metadata {
    this.trace?.push('s63meta');
    void content;
    return {
      hashValue: pdfSha256,
      hashAlgorithm: 'SHA-256',
      producedBy: 'dmj.one Trust Services issuer',
      productionMethod: 'Automated detached ML-DSA-87 signing (no embedded PDF signature)',
      deviceParticulars: 'Cloud Run container, asia-east1',
      generatedAt: new Date().toISOString(),
    };
  }
  async generate(record: CredentialRecord): Promise<Uint8Array> {
    this.trace?.push('s63generate');
    void record;
    return new Uint8Array([0x36, 0x33]); // "63"
  }
}

/** A no-op logger satisfying the pino `Logger` shape used by the service. */
export function makeFakeLogger(): Logger {
  const noop = (): void => undefined;
  const logger = {
    level: 'silent',
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    silent: noop,
    child: () => logger,
  };
  return logger as unknown as Logger;
}

/** Deterministic env good enough to construct the app in tests. */
export function makeTestEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  const base: AppEnv = {
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    SERVICE_ROLE: 'issuer',
    PORT: 8080,
    GCP_PROJECT_ID: 'test-project',
    GCP_REGION: 'asia-east1',
    FIRESTORE_DATABASE_ID: '(default)',
    ISSUER_PUBLIC_URL: 'https://issue.example.test',
    VERIFY_PUBLIC_URL: 'https://verify.example.test',
    TRUST_SERVICE_NAME: 'dmj.one Trust Services',
    TRUST_SERVICE_OU: 'Document Signing',
    TRUST_SERVICE_COUNTRY: 'IN',
    ISSUER_LEGAL_NAME: 'dmj.one (independent educational initiative)',
    ISSUER_CONTACT_EMAIL: 'contact@dmj.one',
    ISSUER_CONTACT_PHONE: '+91 79799 30293',
    ARGON2_MEMORY_KIB: 65536,
    ARGON2_ITERATIONS: 3,
    ARGON2_PARALLELISM: 4,
    SESSION_SECRET: 'test-session-secret-at-least-16-chars', // pragma: allowlist secret
    ADMIN_SESSION_TTL_SECONDS: 900,
    MAX_AUTH_FAILURES: 10,
    ANCHOR_INTERVAL_MINUTES: 60,
    WEBAUTHN_RP_ID: 'example.test',
    WEBAUTHN_RP_NAME: 'dmj.one Trust Services',
    WEBAUTHN_ORIGIN: 'https://issue.example.test',
  };
  return { ...base, ...overrides };
}

export interface BuiltDeps extends IssuerDeps {
  trace: CallTrace;
  credentialRepo: FakeCredentialRepo;
  blobStore: FakeBlobStore;
  logRepo: FakeLogRepo;
  anchorRepo: FakeAnchorRepo;
  adminRepo: FakeAdminRepo;
  auditLog: FakeAuditLog;
  secretStore: FakeSecretStore;
  signer: FakeSigner;
  anchorPublisher: FakeAnchorPublisher;
  passwordHasher: FakePasswordHasher;
  renderer: FakeRenderer;
  section63: FakeSection63;
  secretSealer: FakeSecretSealer;
}

/**
 * Assemble a full fake {@link IssuerDeps} graph wired to one shared call trace.
 * The `conflictError` factory lets a test arm the log repo to throw
 * LOG_CONFLICT a fixed number of times before succeeding.
 */
export function buildDeps(opts: {
  env?: Partial<AppEnv>;
  logConflicts?: number;
  conflictError?: () => Error;
  /** When set, the fake signer attaches this RFC-3161 token to every result. */
  tsaTimestampToken?: string;
} = {}): BuiltDeps {
  const trace: CallTrace = [];
  const logRepo = new FakeLogRepo(trace, opts.conflictError);
  if (opts.logConflicts) logRepo.conflictsRemaining = opts.logConflicts;

  const deps: BuiltDeps = {
    trace,
    env: makeTestEnv(opts.env),
    logger: makeFakeLogger(),
    credentialRepo: new FakeCredentialRepo(),
    blobStore: new FakeBlobStore(trace),
    logRepo,
    anchorRepo: new FakeAnchorRepo(),
    adminRepo: new FakeAdminRepo(),
    auditLog: new FakeAuditLog(trace),
    secretStore: new FakeSecretStore(),
    signer: new FakeSigner(trace, opts.tsaTimestampToken),
    logSigner: new FakeLogSigner(),
    anchorPublisher: new FakeAnchorPublisher(),
    passwordHasher: new FakePasswordHasher(),
    renderer: new FakeRenderer(trace),
    section63: new FakeSection63(trace),
    secretSealer: new FakeSecretSealer(),
  };
  return deps;
}
