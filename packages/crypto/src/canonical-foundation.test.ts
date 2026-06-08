/**
 * THE GATE (spec §5): backward-compatibility proofs for the trusted-documents
 * foundation. Exercised from the crypto package because both sign and verify
 * depend on byte-identical canonical output.
 *
 *  §5.1 Frozen-cert-payload golden vector — a fixed CredentialContent + fixed
 *       pdfSha256 must equal a hard-coded canonical JSON literal. This freezes
 *       the bytes the ML-DSA signature covers against any accidental edit to
 *       computeCanonicalPayload; a single changed byte breaks every already
 *       issued certificate.
 *  §5.3 Verify-parity — computeCanonicalPayloadForRecord(certRecord) is
 *       byte-identical to computeCanonicalPayload(content, pdfSha256) for a
 *       record with NO kind and one with kind:'certificate', so existing certs
 *       keep verifying after the by-kind dispatch is introduced.
 *
 * (The new letter/upload branches are covered here too — determinism and the
 * optional-field normalization — but they share NO bytes with the frozen cert
 * branch, so they cannot regress it.)
 */

import {
  canonicalJson,
  computeCanonicalPayload,
  computeCanonicalPayloadForRecord,
  computeLetterCanonicalPayload,
  computeUploadCanonicalPayload,
  type CredentialRecord,
  type LetterContent,
  type Section63Metadata,
  type UploadAttestation,
} from '@dmjone/shared';
import { describe, expect, it } from 'vitest';

/**
 * The exact fixture whose canonical bytes are frozen below. Chosen to exercise
 * the live shape: multiple body paragraphs, a present closingLine, and a
 * unicode middot in the signatory role. DO NOT change these values or the
 * literal — they are the gate.
 */
const FROZEN_CONTENT = {
  credentialId: 'DMJ-IC-20260605-01',
  type: 'internship' as const,
  issueDate: '2026-06-05',
  kicker: 'Certificate of',
  title: 'INTERNSHIP',
  intro: 'This is to certify that',
  recipientName: 'Aarav Sharma',
  bodyParagraphs: [
    'worked with **dmj.one** as a **Software Engineering Intern** from January 2026 to May 2026.',
    'demonstrating diligence, skill, and integrity throughout the engagement.',
  ],
  closingLine: 'We wish them all the best in everything that lies ahead.',
  signatory: { name: 'Divya Mohan', role: 'Founder · dmj.one', phone: '+91 79799 30293' },
};

const FROZEN_PDF_SHA256 = 'b'.repeat(64);

/**
 * The frozen canonical JSON — captured from the CURRENT computeCanonicalPayload
 * output (sorted keys, no whitespace, UTF-8) for {@link FROZEN_CONTENT} +
 * {@link FROZEN_PDF_SHA256}. Pasted verbatim as the literal expectation.
 */
const FROZEN_CERT_PAYLOAD =
  '{"bodyParagraphs":["worked with **dmj.one** as a **Software Engineering Intern** from January 2026 to May 2026.","demonstrating diligence, skill, and integrity throughout the engagement."],"closingLine":"We wish them all the best in everything that lies ahead.","credentialId":"DMJ-IC-20260605-01","intro":"This is to certify that","issueDate":"2026-06-05","kicker":"Certificate of","pdfSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","recipientName":"Aarav Sharma","signatory":{"name":"Divya Mohan","phone":"+91 79799 30293","role":"Founder · dmj.one"},"title":"INTERNSHIP","type":"internship","v":1}';

const SECTION63: Section63Metadata = {
  hashValue: FROZEN_PDF_SHA256,
  hashAlgorithm: 'SHA-256',
  producedBy: 'dmj.one Trust Services',
  productionMethod: 'render → PAdES + ML-DSA-87',
  deviceParticulars: 'test',
  generatedAt: '2026-06-05T00:00:00.000Z',
};

/** A complete cert record wrapping the frozen content; crypto fields are inert here. */
function frozenCertRecord(overrides: Partial<CredentialRecord> = {}): CredentialRecord {
  return {
    id: FROZEN_CONTENT.credentialId,
    content: FROZEN_CONTENT,
    status: 'valid',
    createdAt: '2026-06-05T00:00:00.000Z',
    pdfSha256: FROZEN_PDF_SHA256,
    canonicalPayload: '',
    canonicalSha256: '',
    mldsaSignature: '',
    mldsaPublicKeyId: '',
    padesCertFingerprint: '',
    logSeq: 1,
    logLeafHash: '',
    passwordHash: '',
    section63: SECTION63,
    ...overrides,
  };
}

describe('§5.1 frozen-cert-payload golden vector', () => {
  it('computeCanonicalPayload matches the hard-coded frozen literal byte-for-byte', () => {
    expect(computeCanonicalPayload(FROZEN_CONTENT, FROZEN_PDF_SHA256)).toBe(FROZEN_CERT_PAYLOAD);
  });

  it('the frozen literal is itself canonical form (sorted keys, no insignificant whitespace, v=1)', () => {
    const parsed = JSON.parse(FROZEN_CERT_PAYLOAD) as Record<string, unknown>;
    expect(parsed['v']).toBe(1);
    // Re-serialising the parsed object through the SHARED canonicalizer must
    // reproduce the literal byte-for-byte. This proves the expectation is in
    // canonical form (sorted keys, no inter-token whitespace) without a fragile
    // regex that would also flag the spaces inside string VALUES.
    expect(canonicalJson(parsed)).toBe(FROZEN_CERT_PAYLOAD);
  });
});

describe('§5.3 verify-parity (certificate records keep verifying)', () => {
  it('computeCanonicalPayloadForRecord === computeCanonicalPayload for a NO-kind record', () => {
    const record = frozenCertRecord();
    expect(record.kind).toBeUndefined();
    expect(computeCanonicalPayloadForRecord(record)).toBe(
      computeCanonicalPayload(FROZEN_CONTENT, FROZEN_PDF_SHA256),
    );
    // And it equals the frozen bytes themselves.
    expect(computeCanonicalPayloadForRecord(record)).toBe(FROZEN_CERT_PAYLOAD);
  });

  it("computeCanonicalPayloadForRecord === computeCanonicalPayload for an explicit kind:'certificate'", () => {
    const record = frozenCertRecord({ kind: 'certificate' });
    expect(computeCanonicalPayloadForRecord(record)).toBe(
      computeCanonicalPayload(FROZEN_CONTENT, FROZEN_PDF_SHA256),
    );
    expect(computeCanonicalPayloadForRecord(record)).toBe(FROZEN_CERT_PAYLOAD);
  });
});

describe('letter canonical payload (new branch)', () => {
  const letter: LetterContent = {
    documentId: 'DMJ-LTR-20260605-01',
    issueDate: '2026-06-05',
    reference: 'Ref/2026/07',
    recipientLines: ['The Registrar', 'Some University'],
    subject: 'Verification of association',
    salutation: 'Dear Sir/Madam,',
    bodyParagraphs: ['This is to confirm the **association** described above.'],
    valediction: 'Sincerely,',
    signatory: { name: 'Divya Mohan', role: 'Founder · dmj.one', phone: '+91 79799 30293' },
  };
  const pdf = 'c'.repeat(64);

  it('is deterministic and routes through computeCanonicalPayloadForRecord by kind', () => {
    const direct = computeLetterCanonicalPayload(letter, pdf);
    expect(direct).toBe(computeLetterCanonicalPayload(letter, pdf));
    expect(JSON.parse(direct)).toMatchObject({ v: 1, kind: 'letter', documentId: letter.documentId });

    const record: CredentialRecord = {
      ...frozenCertRecord(),
      kind: 'letter',
      content: letter,
      pdfSha256: pdf,
    };
    expect(computeCanonicalPayloadForRecord(record)).toBe(direct);
  });

  it("normalizes absent optionals to '' (same style as the cert branch)", () => {
    const minimal: LetterContent = {
      documentId: letter.documentId,
      issueDate: letter.issueDate,
      recipientLines: [],
      bodyParagraphs: letter.bodyParagraphs,
      signatory: letter.signatory,
    };
    const parsed = JSON.parse(computeLetterCanonicalPayload(minimal, pdf)) as Record<string, unknown>;
    expect(parsed['reference']).toBe('');
    expect(parsed['subject']).toBe('');
    expect(parsed['salutation']).toBe('');
    expect(parsed['valediction']).toBe('');
  });
});

describe('upload canonical payload (new branch)', () => {
  const placement = { page: 1, xPct: 0.1, yPct: 0.8, wPct: 0.2 };
  const upload: UploadAttestation = {
    documentId: 'DMJ-DOC-20260605-01',
    issueDate: '2026-06-05',
    originalFilename: 'agreement.pdf',
    originalSha256: 'e'.repeat(64),
    pageCount: 3,
    signaturePlacement: placement,
    signatory: { name: 'Divya Mohan', role: 'Founder · dmj.one', phone: '+91 79799 30293' },
  };
  const pdf = 'd'.repeat(64);

  it('is deterministic and routes through computeCanonicalPayloadForRecord by kind', () => {
    const direct = computeUploadCanonicalPayload(upload, pdf);
    expect(direct).toBe(computeUploadCanonicalPayload(upload, pdf));
    expect(JSON.parse(direct)).toMatchObject({ v: 1, kind: 'upload', pageCount: 3 });

    const record: CredentialRecord = {
      ...frozenCertRecord(),
      kind: 'upload',
      content: upload,
      pdfSha256: pdf,
    };
    expect(computeCanonicalPayloadForRecord(record)).toBe(direct);
  });

  it('normalizes an absent signaturePlacement to null', () => {
    const { signaturePlacement: _omit, ...withoutPlacement } = upload;
    void _omit;
    const parsed = JSON.parse(
      computeUploadCanonicalPayload(withoutPlacement, pdf),
    ) as Record<string, unknown>;
    expect(parsed['signaturePlacement']).toBeNull();
  });
});
