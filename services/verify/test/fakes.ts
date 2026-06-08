/**
 * In-line fakes of the @dmjone/shared interfaces the verify service consumes.
 *
 * The verify service is wired via dependency injection (createVerifyApp(deps)),
 * so its tests never touch the real crypto/data packages — they exercise the
 * HTTP surface against these deterministic, in-memory doubles. Keeping them
 * here (not imported from a sibling impl package) is what lets this stream
 * typecheck and test in isolation.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type {
  AnchorProof,
  AnchorRepository,
  AuditEvent,
  AuditLog,
  BlobKind,
  BlobStore,
  CredentialContent,
  CredentialRecord,
  CredentialRepository,
  CredentialStatus,
  LogLeaf,
  LogRepository,
  LogVerifier,
  PadesVerifyResult,
  PasswordHasher,
  SignatureVerifier,
  SignedTreeHead,
} from '@dmjone/shared';
import { GENESIS_HEAD_HASH } from '@dmjone/shared';

/** SHA-256 hex of arbitrary bytes — the same primitive the service uses. */
export function hashHex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

/** Build a complete, internally-consistent credential record for tests. */
export function makeRecord(overrides: Partial<CredentialRecord> = {}): CredentialRecord {
  const content: CredentialContent = {
    credentialId: 'DMJ-IC-20260604-01',
    type: 'internship',
    issueDate: '2026-06-04',
    kicker: 'Certificate of',
    title: 'INTERNSHIP',
    intro: 'This is to certify that',
    recipientName: 'Aarav Sharma',
    bodyParagraphs: [
      'has successfully completed a software engineering internship at dmj.one.',
    ],
    closingLine: 'We wish them continued success.',
    signatory: { name: 'Divya Mohan', role: 'Founder · dmj.one', phone: '+91 79799 30293' },
    ...overrides.content,
  };
  return {
    id: content.credentialId,
    content,
    status: 'valid',
    createdAt: '2026-06-04T10:00:00.000Z',
    pdfSha256: 'a'.repeat(64),
    canonicalPayload: '{"v":1}',
    canonicalSha256: 'b'.repeat(64),
    mldsaSignature: 'BASE64SIG',
    mldsaPublicKeyId: 'mldsa-key-1',
    padesCertFingerprint: 'c'.repeat(64),
    logSeq: 1,
    logLeafHash: 'd'.repeat(64),
    passwordHash: '$argon2id$v=19$stored-hash',
    section63: {
      hashValue: 'a'.repeat(64),
      hashAlgorithm: 'SHA-256',
      producedBy: 'dmj.one Trust Services',
      productionMethod: 'Deterministic HTML→PDF render, hybrid PAdES + ML-DSA-87 signature',
      deviceParticulars: 'Cloud Run container, asia-east1',
      generatedAt: '2026-06-04T10:00:00.000Z',
    },
    ...overrides,
  };
}

export class FakeCredentialRepository implements CredentialRepository {
  private readonly byId = new Map<string, CredentialRecord>();

  constructor(records: CredentialRecord[] = []) {
    for (const r of records) this.byId.set(r.id, r);
  }

  add(record: CredentialRecord): void {
    this.byId.set(record.id, record);
  }

  create(record: CredentialRecord): Promise<void> {
    this.byId.set(record.id, record);
    return Promise.resolve();
  }

  getById(id: string): Promise<CredentialRecord | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  exists(id: string): Promise<boolean> {
    return Promise.resolve(this.byId.has(id));
  }

  setStatus(id: string, status: CredentialStatus, at: string): Promise<void> {
    const r = this.byId.get(id);
    if (r) this.byId.set(id, { ...r, status, revokedAt: at });
    return Promise.resolve();
  }

  list(): Promise<{ items: CredentialRecord[]; nextCursor?: string }> {
    return Promise.resolve({ items: [...this.byId.values()] });
  }
}

export class FakeBlobStore implements BlobStore {
  private readonly blobs = new Map<string, Uint8Array>();

  private key(credentialId: string, kind: BlobKind): string {
    return `${credentialId}:${kind}`;
  }

  set(credentialId: string, kind: BlobKind, bytes: Uint8Array): void {
    this.blobs.set(this.key(credentialId, kind), bytes);
  }

  put(credentialId: string, kind: BlobKind, bytes: Uint8Array): Promise<void> {
    this.blobs.set(this.key(credentialId, kind), bytes);
    return Promise.resolve();
  }

  get(credentialId: string, kind: BlobKind): Promise<Uint8Array | null> {
    return Promise.resolve(this.blobs.get(this.key(credentialId, kind)) ?? null);
  }
}

/**
 * Verifier double. Defaults to "everything valid"; flip the flags or the
 * predicate to simulate a bad signature / failed PAdES.
 */
export class FakeSignatureVerifier implements SignatureVerifier {
  mldsaValid = true;
  padesResult: PadesVerifyResult = {
    present: true,
    intact: true,
    certFingerprint: 'c'.repeat(64),
    signerSubject: 'CN=dmj.one Trust Services, OU=Document Signing, C=IN',
  };

  verifyMldsa(_content: CredentialContent, _pdfSha256: string, _signatureB64: string): boolean {
    return this.mldsaValid;
  }

  verifyMldsaForRecord(_record: CredentialRecord): boolean {
    return this.mldsaValid;
  }

  verifyPdfPades(_signedPdf: Uint8Array): Promise<PadesVerifyResult> {
    return Promise.resolve(this.padesResult);
  }
}

/**
 * Log verifier double. computeLeafHash mirrors the contract's intent
 * (leaf = SHA-256(canonicalSha256-as-bytes)) deterministically so inclusion
 * checks are meaningful; verifyHead defaults to true.
 */
export class FakeLogVerifier implements LogVerifier {
  headValid = true;

  computeLeafHash(canonicalSha256: string): string {
    return hashHex(new TextEncoder().encode(canonicalSha256));
  }

  computeHeadHash(leafHash: string, prevHeadHash: string): string {
    return hashHex(new TextEncoder().encode(leafHash + prevHeadHash));
  }

  verifyHead(_head: SignedTreeHead): boolean {
    return this.headValid;
  }
}

export class FakeLogRepository implements LogRepository {
  private readonly leaves = new Map<number, LogLeaf>();
  private readonly byCredential = new Map<string, LogLeaf>();
  private head: SignedTreeHead | null = null;

  /** Register a leaf consistent with FakeLogVerifier.computeLeafHash. */
  addLeaf(leaf: LogLeaf): void {
    this.leaves.set(leaf.seq, leaf);
    this.byCredential.set(leaf.credentialId, leaf);
  }

  setHead(head: SignedTreeHead): void {
    this.head = head;
  }

  getHead(): Promise<SignedTreeHead | null> {
    return Promise.resolve(this.head);
  }

  appendLeaf(leaf: LogLeaf, head: SignedTreeHead): Promise<void> {
    this.addLeaf(leaf);
    this.head = head;
    return Promise.resolve();
  }

  getLeaf(seq: number): Promise<LogLeaf | null> {
    return Promise.resolve(this.leaves.get(seq) ?? null);
  }

  getLeafByCredential(credentialId: string): Promise<LogLeaf | null> {
    return Promise.resolve(this.byCredential.get(credentialId) ?? null);
  }

  listLeaves(fromSeq: number, toSeq: number): Promise<LogLeaf[]> {
    const out: LogLeaf[] = [];
    for (let s = fromSeq; s <= toSeq; s++) {
      const l = this.leaves.get(s);
      if (l) out.push(l);
    }
    return Promise.resolve(out);
  }
}

export class FakeAnchorRepository implements AnchorRepository {
  private readonly proofs: AnchorProof[] = [];

  add(proof: AnchorProof): void {
    this.proofs.push(proof);
  }

  save(proof: AnchorProof): Promise<void> {
    this.proofs.push(proof);
    return Promise.resolve();
  }

  latest(): Promise<AnchorProof | null> {
    if (this.proofs.length === 0) return Promise.resolve(null);
    return Promise.resolve(
      this.proofs.reduce((a, b) => (b.headSeq > a.headSeq ? b : a)),
    );
  }

  forHead(headSeq: number): Promise<AnchorProof | null> {
    return Promise.resolve(this.proofs.find((p) => p.headSeq === headSeq) ?? null);
  }
}

export class FakeAuditLog implements AuditLog {
  readonly events: AuditEvent[] = [];

  append(
    event: Omit<AuditEvent, 'id' | 'prevHash' | 'hash' | 'at'> & { at?: string },
  ): Promise<AuditEvent> {
    const prevHash = this.events.at(-1)?.hash ?? GENESIS_HEAD_HASH;
    const at = event.at ?? new Date().toISOString();
    const full: AuditEvent = {
      id: `evt-${this.events.length + 1}`,
      at,
      actor: event.actor,
      action: event.action,
      prevHash,
      hash: hashHex(new TextEncoder().encode(prevHash + event.action + at)),
      ...(event.subject !== undefined ? { subject: event.subject } : {}),
      ...(event.requestId !== undefined ? { requestId: event.requestId } : {}),
      ...(event.meta !== undefined ? { meta: event.meta } : {}),
    };
    this.events.push(full);
    return Promise.resolve(full);
  }

  verify(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

/**
 * A PasswordHasher double whose `verify` is a plain equality check against a
 * known plaintext, so download tests are deterministic and fast. The real
 * Argon2id hasher is injected in production; both sides use the SAME injected
 * instance (issuer at issue-time, verify at download-time), so encoding lines
 * up by construction.
 */
export class FakePasswordHasher implements PasswordHasher {
  /** stored value -> the single plaintext that verifies against it. */
  private readonly table = new Map<string, string>();
  verifyCalls = 0;
  /** The `stored` argument of the most recent verify() call (for wiring assertions). */
  lastStored: string | null = null;
  /**
   * When true, `verify` THROWS on a stored hash it never minted — mimicking the
   * real `argon2`/`@node-rs/argon2` behaviour on a foreign PHC string. Used to
   * prove the download path can't leak an id-existence oracle via 500-vs-403.
   */
  throwOnUnknown = false;

  /** Register that `plaintext` is the password behind `stored`. */
  register(stored: string, plaintext: string): void {
    this.table.set(stored, plaintext);
  }

  hash(password: string): Promise<string> {
    const stored = `$argon2id$v=19$${password}`;
    this.table.set(stored, password);
    return Promise.resolve(stored);
  }

  verify(password: string, stored: string): Promise<boolean> {
    this.verifyCalls += 1;
    this.lastStored = stored;
    if (this.throwOnUnknown && !this.table.has(stored)) {
      return Promise.reject(new Error('argon2: unrecognised hash'));
    }
    return Promise.resolve(this.table.get(stored) === password);
  }
}

/** A minimal AppEnv-shaped object good enough for the verify service. */
export function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    NODE_ENV: 'test' as const,
    LOG_LEVEL: 'error' as const,
    SERVICE_ROLE: 'verify' as const,
    PORT: 8080,
    GCP_PROJECT_ID: 'test-project',
    GCP_REGION: 'asia-east1',
    FIRESTORE_DATABASE_ID: '(default)',
    ISSUER_PUBLIC_URL: 'https://issue.dmj.one',
    VERIFY_PUBLIC_URL: 'https://verify.dmj.one',
    TRUST_SERVICE_NAME: 'dmj.one Trust Services',
    TRUST_SERVICE_OU: 'Document Signing',
    TRUST_SERVICE_COUNTRY: 'IN',
    ISSUER_LEGAL_NAME: 'dmj.one (independent educational initiative)',
    ISSUER_CONTACT_EMAIL: 'contact@dmj.one',
    ISSUER_CONTACT_PHONE: '+91 79799 30293',
    ARGON2_MEMORY_KIB: 19456,
    ARGON2_ITERATIONS: 2,
    ARGON2_PARALLELISM: 1,
    SESSION_SECRET: 'test-session-secret-0123456789', // pragma: allowlist secret
    ADMIN_SESSION_TTL_SECONDS: 900,
    MAX_AUTH_FAILURES: 10,
    ANCHOR_INTERVAL_MINUTES: 60,
    ...overrides,
  };
}

/**
 * A permissive typed view over a JSON response body, so strict-TS tests can
 * read the fields they assert on without `unknown` noise. Covers both the
 * VerificationResult shape and the ApiError shape (the only two JSON bodies the
 * service returns).
 */
export interface JsonBody {
  credentialId?: string;
  outcome?: string;
  /** Present on every VerificationResult; members optional so absence is testable. */
  checks: Record<string, boolean | undefined>;
  /** Present on a known credential; members optional. */
  publicFields: Record<string, string | undefined>;
  verifiedAt?: string;
  status?: string;
  /** Present on every ApiError. */
  error: string;
  code?: string;
  requestId?: string;
}

/** Parse a Response body as the permissive {@link JsonBody} view. */
export async function asJson(res: Response): Promise<JsonBody> {
  return (await res.json()) as JsonBody;
}

/** A no-op logger satisfying the pino-ish shape the app uses. */
export function makeLogger() {
  const noop = (): void => {};
  const logger = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    child: () => logger,
  };
  return logger;
}
