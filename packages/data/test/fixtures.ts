/**
 * Test fixtures: realistic domain objects matching the @dmjone/shared types.
 * Kept minimal but valid so tests exercise the real serialization paths.
 */

import { GENESIS_HEAD_HASH } from '@dmjone/shared';
import type {
  CredentialContent,
  CredentialRecord,
  LetterContent,
  LogLeaf,
  Section63Metadata,
  SignedTreeHead,
  UploadAttestation,
} from '@dmjone/shared';

export function makeContent(overrides: Partial<CredentialContent> = {}): CredentialContent {
  return {
    credentialId: 'DMJ-IC-20260604-01',
    type: 'internship',
    issueDate: '2026-06-04',
    kicker: 'Certificate of',
    title: 'INTERNSHIP',
    intro: 'This is to certify that',
    recipientName: 'Asha Rao',
    bodyParagraphs: ['Completed a software internship with distinction.'],
    closingLine: 'Awarded with appreciation.',
    signatory: {
      name: 'Divya Mohan',
      role: 'Founder · dmj.one',
      phone: '+91 79799 30293',
    },
    ...overrides,
  };
}

function makeSection63(hashValue: string): Section63Metadata {
  return {
    hashValue,
    hashAlgorithm: 'SHA-256',
    producedBy: 'dmj.one Trust Services',
    productionMethod: 'Deterministic HTML→PDF render, hybrid PAdES + ML-DSA-87 signing',
    deviceParticulars: 'Cloud Run container, asia-east1',
    generatedAt: '2026-06-04T10:00:00.000Z',
  };
}

export function makeRecord(overrides: Partial<CredentialRecord> = {}): CredentialRecord {
  const id = overrides.id ?? overrides.content?.credentialId ?? 'DMJ-IC-20260604-01';
  const content = overrides.content ?? makeContent({ credentialId: id });
  return {
    id,
    content,
    status: 'valid',
    createdAt: '2026-06-04T10:00:00.000Z',
    pdfSha256: 'a'.repeat(64),
    canonicalPayload: '{"v":1}',
    canonicalSha256: 'b'.repeat(64),
    mldsaSignature: 'c2lnbmF0dXJl',
    mldsaPublicKeyId: 'mldsa-key-1',
    padesCertFingerprint: 'd'.repeat(64),
    logSeq: 1,
    logLeafHash: 'e'.repeat(64),
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$abc$def',
    section63: makeSection63('a'.repeat(64)),
    ...overrides,
  };
}

/**
 * Letter record fixture (kind: 'letter'). PII lives in recipientLines / subject
 * / salutation / bodyParagraphs / valediction / reference — the fields erase()
 * must blank for a letter. Crypto residue mirrors {@link makeRecord}.
 */
export function makeLetterRecord(overrides: Partial<CredentialRecord> = {}): CredentialRecord {
  const id = overrides.id ?? 'DMJ-LTR-20260608-01';
  const content: LetterContent = {
    documentId: id,
    issueDate: '2026-06-08',
    reference: 'Ref: DMJ/2026/01',
    recipientLines: ['Asha Rao', '221B Baker Street'],
    subject: 'Letter of recommendation for Asha Rao',
    salutation: 'Dear Sir/Madam,',
    bodyParagraphs: ['Asha Rao contributed to dmj.one with distinction.'],
    valediction: 'Sincerely,',
    signatory: { name: 'Divya Mohan', role: 'Founder · dmj.one', phone: '+91 79799 30293' },
  };
  return { ...makeRecord({ id }), kind: 'letter', content, ...overrides };
}

/**
 * Upload-attestation record fixture (kind: 'upload'). The only recipient PII is
 * originalFilename; originalSha256 / pageCount are retained machine facts.
 */
export function makeUploadRecord(overrides: Partial<CredentialRecord> = {}): CredentialRecord {
  const id = overrides.id ?? 'DMJ-DOC-20260608-01';
  const content: UploadAttestation = {
    documentId: id,
    issueDate: '2026-06-08',
    originalFilename: 'asha-rao-question-paper.pdf',
    originalSha256: 'c'.repeat(64),
    pageCount: 3,
    signatory: { name: 'Divya Mohan', role: 'Founder · dmj.one', phone: '+91 79799 30293' },
  };
  return { ...makeRecord({ id }), kind: 'upload', content, ...overrides };
}

/**
 * Build a leaf + the head that extends `prevHead` (or genesis when null). The
 * hashes are deterministic placeholders — the repo only checks the prevHeadHash
 * linkage + seq monotonicity, not the hash math (crypto's LogSigner owns that).
 */
export function makeLeafAndHead(
  seq: number,
  credentialId: string,
  prevHead: SignedTreeHead | null,
): { leaf: LogLeaf; head: SignedTreeHead } {
  const prevHeadHash = prevHead ? prevHead.headHash : GENESIS_HEAD_HASH;
  const leaf: LogLeaf = {
    seq,
    leafHash: `leaf-${seq}`.padEnd(64, '0'),
    credentialId,
    canonicalSha256: `canon-${seq}`.padEnd(64, '0'),
    timestamp: '2026-06-04T10:00:00.000Z',
  };
  const head: SignedTreeHead = {
    seq,
    headHash: `head-${seq}`.padEnd(64, '0'),
    prevHeadHash,
    signature: `sig-${seq}`,
    signedAt: '2026-06-04T10:00:00.000Z',
  };
  return { leaf, head };
}
