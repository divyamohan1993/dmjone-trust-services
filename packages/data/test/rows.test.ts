/**
 * Regression: the Firestore credential row MUST preserve the `kind` discriminator
 * across write→read. It was dropped by rowToCredential, so every stored
 * letter/upload read back as a certificate — the verify page then rendered cert
 * fields that don't exist on the content (escapeHtml(undefined) → 500) and
 * recomputed the canonical payload on the wrong branch (ML-DSA → "unknown").
 *
 * The in-memory fakes store the record object as-is, so they never exercised this
 * seam — these tests drive credentialToRow/rowToCredential directly.
 */
import { describe, it, expect } from 'vitest';

import type { CredentialContent, CredentialRecord, UploadAttestation } from '@dmjone/shared';

import { credentialToRow, rowToCredential } from '../src/firestore/rows.js';

function baseRecord(): Omit<CredentialRecord, 'content' | 'kind'> {
  return {
    id: 'DMJ-DOC-20260608-01',
    status: 'valid',
    createdAt: '2026-06-08T00:00:00.000Z',
    pdfSha256: 'a'.repeat(64),
    canonicalPayload: '{}',
    canonicalSha256: 'b'.repeat(64),
    mldsaSignature: 'sig',
    mldsaPublicKeyId: 'k1',
    padesCertFingerprint: 'fp',
    logSeq: 1,
    logLeafHash: 'lh',
    passwordHash: 'ph',
    section63: {
      hashValue: 'h'.repeat(64),
      hashAlgorithm: 'SHA-256',
      producedBy: 'dmj.one',
      productionMethod: 'method',
      deviceParticulars: 'device',
      generatedAt: '2026-06-08T00:00:00.000Z',
    },
  };
}

const SIGNATORY = { name: 'Divya Mohan', role: 'Founder · dmj.one', phone: '+91 79799 30293' };

describe('credential row round-trip preserves kind', () => {
  it('round-trips an upload record with kind + content intact', () => {
    const content: UploadAttestation = {
      documentId: 'DMJ-DOC-20260608-01',
      issueDate: '2026-06-08',
      originalFilename: 'question-paper.pdf',
      originalSha256: 'c'.repeat(64),
      pageCount: 3,
      signatory: SIGNATORY,
    };
    const record: CredentialRecord = { ...baseRecord(), kind: 'upload', content };

    const back = rowToCredential(credentialToRow(record));

    expect(back.kind).toBe('upload');
    expect(back.content).toEqual(content);
  });

  it('round-trips a letter record with kind intact', () => {
    const record: CredentialRecord = {
      ...baseRecord(),
      id: 'DMJ-LTR-20260608-01',
      kind: 'letter',
      content: {
        documentId: 'DMJ-LTR-20260608-01',
        issueDate: '2026-06-08',
        recipientLines: ['To whom it may concern'],
        bodyParagraphs: ['Body.'],
        signatory: SIGNATORY,
      },
    };

    expect(rowToCredential(credentialToRow(record)).kind).toBe('letter');
  });

  it('a row with no kind reads back as the certificate default (legacy-safe)', () => {
    const content: CredentialContent = {
      credentialId: 'DMJ-IC-20260605-01',
      type: 'internship',
      issueDate: '2026-06-05',
      kicker: 'Certificate of',
      title: 'INTERNSHIP',
      intro: 'This is to certify that',
      recipientName: 'Aarav Sharma',
      bodyParagraphs: ['worked with us'],
      signatory: SIGNATORY,
    };
    const record: CredentialRecord = { ...baseRecord(), content };

    expect(rowToCredential(credentialToRow(record)).kind).toBeUndefined();
  });
});
