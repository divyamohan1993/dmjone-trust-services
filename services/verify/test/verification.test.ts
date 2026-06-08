/**
 * Unit tests for the pure verification core: deriveOutcome + the check
 * builders. This is the single most correctness-sensitive surface in the
 * service (both /api/verify/:id and /api/verify/file route through it), so it
 * is tested in isolation, free of HTTP.
 */

import { describe, expect, it } from 'vitest';
import { checkAnchor, deriveOutcome, publicFieldsOf } from '../src/verification.js';
import { FakeAnchorRepository, makeRecord, makeLetterRecord, makeUploadRecord } from './fakes.js';
import type { AnchorProof, VerificationChecks } from '@dmjone/shared';

const allGood: VerificationChecks = {
  mldsaSignature: true,
  hashMatch: true,
  logInclusion: true,
  anchorProof: true,
  notRevoked: true,
};

describe('deriveOutcome', () => {
  it('returns valid when every gating check passes', () => {
    expect(deriveOutcome({ ...allGood })).toBe('valid');
  });

  it('returns valid even when the anchor is still pending (periodic anchoring)', () => {
    // A freshly-issued credential is not yet anchored; that must NOT make it unknown.
    expect(deriveOutcome({ ...allGood, anchorProof: false })).toBe('valid');
  });

  it('returns tampered when the file hash does not match (file flow)', () => {
    expect(deriveOutcome({ ...allGood, hashMatch: false })).toBe('tampered');
  });

  it('prioritises tampered over a bad signature', () => {
    expect(deriveOutcome({ ...allGood, hashMatch: false, mldsaSignature: false })).toBe('tampered');
  });

  it('returns unknown when the ML-DSA signature fails', () => {
    expect(deriveOutcome({ ...allGood, mldsaSignature: false })).toBe('unknown');
  });

  it('returns unknown when log inclusion fails', () => {
    expect(deriveOutcome({ ...allGood, logInclusion: false })).toBe('unknown');
  });

  it('returns revoked when crypto is intact but the credential is revoked', () => {
    expect(deriveOutcome({ ...allGood, notRevoked: false })).toBe('revoked');
  });

  it('prefers unknown over revoked when the signature itself is broken', () => {
    // If we cannot even trust the bytes, "revoked" would be an overclaim.
    expect(deriveOutcome({ ...allGood, mldsaSignature: false, notRevoked: false })).toBe('unknown');
  });

  it('is VALID when no PAdES key is present (by-id shape: ML-DSA is authoritative)', () => {
    // The by-id flow produces a checks object with no padesSignature key at all.
    // `allGood` already omits it; this pins that the absence of PAdES is VALID,
    // never unknown/tampered — authenticity is the detached ML-DSA signature.
    expect('padesSignature' in allGood).toBe(false);
    expect(deriveOutcome({ ...allGood })).toBe('valid');
  });

  it('is VALID when padesSignature is explicitly false (clean PDF, no embedded sig)', () => {
    // Our own documents now ship with NO embedded PAdES, so the file-upload flow
    // sets padesSignature:false. That is informational only and MUST NOT
    // downgrade the verdict: ML-DSA + hash + log + notRevoked are authoritative.
    expect(deriveOutcome({ ...allGood, padesSignature: false })).toBe('valid');
  });

  it('treats padesSignature as a non-gate: true vs false vs absent all yield VALID', () => {
    // The single invariant LEGAL relies on: PAdES never changes the outcome.
    expect(deriveOutcome({ ...allGood, padesSignature: true })).toBe('valid');
    expect(deriveOutcome({ ...allGood, padesSignature: false })).toBe('valid');
    expect(deriveOutcome({ ...allGood })).toBe('valid');
  });
});

describe('checkAnchor', () => {
  // A record at log position 1 (makeRecord default logSeq).
  const record = makeRecord();

  /** A proof covering the record, EXTERNALLY published to GitHub. */
  const publishedProof: AnchorProof = {
    headSeq: 1,
    headHash: 'h'.repeat(64),
    anchoredAt: '2026-06-08T00:00:00.000Z',
    github: {
      repo: 'divyamohan1993/dmjone-trust-anchor',
      commitSha: 'c'.repeat(40),
      url: 'https://github.com/divyamohan1993/dmjone-trust-anchor/blob/main/heads/1.json',
    },
  };

  /** A BARE proof: same head, but GitHub publishing was unconfigured or failed. */
  const bareProof: AnchorProof = {
    headSeq: 1,
    headHash: 'h'.repeat(64),
    anchoredAt: '2026-06-08T00:00:00.000Z',
  };

  it('is true only when a GitHub-published anchor covers the record', async () => {
    const repo = new FakeAnchorRepository();
    repo.add(publishedProof);
    await expect(checkAnchor(record, repo)).resolves.toBe(true);
  });

  it('is false for a BARE proof (saved on publish failure / no GitHub configured)', async () => {
    // The crux of the loophole: a proof with headSeq >= logSeq but NO github
    // field must NOT read as externally anchored. This is the every-pre-activation
    // case — issuance saved a bare proof because anchoring is best-effort.
    const repo = new FakeAnchorRepository();
    repo.add(bareProof);
    await expect(checkAnchor(record, repo)).resolves.toBe(false);
  });

  it('is false when no anchor proof exists at all', async () => {
    const repo = new FakeAnchorRepository();
    await expect(checkAnchor(record, repo)).resolves.toBe(false);
  });

  it('is false when the latest published head is BEHIND the record (not yet covered)', async () => {
    // A published proof for an earlier head does not cover a later record.
    const laterRecord = makeRecord({ logSeq: 5 });
    const repo = new FakeAnchorRepository();
    repo.add(publishedProof); // headSeq 1 < logSeq 5
    await expect(checkAnchor(laterRecord, repo)).resolves.toBe(false);
  });
});

describe('publicFieldsOf', () => {
  it('projects exactly the HR/legal subset and never leaks signature material', () => {
    const record = makeRecord();
    const fields = publicFieldsOf(record, 'dmj.one Trust Services');
    expect(fields).toEqual({
      recipientName: 'Aarav Sharma',
      kicker: 'Certificate of',
      title: 'INTERNSHIP',
      type: 'internship',
      issueDate: '2026-06-04',
      issuer: 'dmj.one Trust Services',
      status: 'valid',
    });
    // No signature / hash material smuggled into the public projection.
    const serialised = JSON.stringify(fields);
    expect(serialised).not.toContain('BASE64SIG');
    expect(serialised).not.toContain(record.pdfSha256);
    expect(serialised).not.toContain('passwordHash');
  });

  it('reflects revoked status in the public fields', () => {
    const record = makeRecord({ status: 'revoked', revokedAt: '2026-06-05T00:00:00.000Z' });
    expect(publicFieldsOf(record, 'dmj.one Trust Services').status).toBe('revoked');
  });

  it('maps a letter onto the frozen public shape (subject headline, addressee, kind)', () => {
    const fields = publicFieldsOf(makeLetterRecord(), 'dmj.one Trust Services');
    expect(fields).toEqual({
      recipientName: 'The Principal',
      kicker: 'Letterhead',
      title: 'Confirmation of Internship Completion', // subject as headline
      type: 'letter',
      issueDate: '2026-06-04',
      issuer: 'dmj.one Trust Services',
      status: 'valid',
    });
  });

  it('falls back to the first recipient line when a letter has no subject', () => {
    const fields = publicFieldsOf(
      makeLetterRecord({ subject: undefined }),
      'dmj.one Trust Services',
    );
    expect(fields.title).toBe('The Principal');
    expect(fields.type).toBe('letter');
  });

  it('maps an upload onto the frozen public shape (filename, kind) without inventing a person', () => {
    const fields = publicFieldsOf(makeUploadRecord(), 'dmj.one Trust Services');
    expect(fields).toEqual({
      recipientName: 'offer-letter.pdf',
      kicker: 'Attested document',
      title: 'offer-letter.pdf',
      type: 'upload',
      issueDate: '2026-06-04',
      issuer: 'dmj.one Trust Services',
      status: 'valid',
    });
  });
});
