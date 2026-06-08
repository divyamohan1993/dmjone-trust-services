/**
 * Unit tests for the pure verification core: deriveOutcome + the check
 * builders. This is the single most correctness-sensitive surface in the
 * service (both /api/verify/:id and /api/verify/file route through it), so it
 * is tested in isolation, free of HTTP.
 */

import { describe, expect, it } from 'vitest';
import { deriveOutcome, publicFieldsOf } from '../src/verification.js';
import { makeRecord, makeLetterRecord, makeUploadRecord } from './fakes.js';
import type { VerificationChecks } from '@dmjone/shared';

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
