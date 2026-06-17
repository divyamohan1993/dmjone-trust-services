/**
 * The content guards, enforced at the issuance boundary. issueCredentialSchema
 * and issueLetterSchema must reject an unfilled `[slot]`, a false-status term,
 * and (for internship-scoped issuance) employment language; and must require the
 * issuer attestation. A clean, attested body parses. The `[auto]` document-number
 * token and a leading `[[align:…]]` directive are NOT treated as unfilled.
 */
import { describe, it, expect } from 'vitest';
import { issueCredentialSchema, issueLetterSchema } from '../src/schemas.js';

const cert = (over: Record<string, unknown> = {}) => ({
  type: 'internship',
  recipientName: 'Aarav Sharma',
  kicker: 'Certificate of',
  title: 'INTERNSHIP',
  intro: 'This is to certify that',
  bodyParagraphs: ['Aarav Sharma interned with dmj.one from 01 Jan 2026 to 01 Mar 2026.'],
  issueDate: '2026-06-17',
  password: 'a-strong-password', // pragma: allowlist secret
  attestation: true,
  ...over,
});

const letter = (over: Record<string, unknown> = {}) => ({
  issueDate: '2026-06-17',
  recipientLines: ['To Whomsoever It May Concern'],
  bodyParagraphs: ['This confirms Aarav Sharma was associated with dmj.one as a contributor.'],
  password: 'a-strong-password', // pragma: allowlist secret
  attestation: true,
  ...over,
});

describe('issueCredentialSchema — content guards', () => {
  it('accepts a clean, attested certificate', () => {
    expect(issueCredentialSchema.safeParse(cert()).success).toBe(true);
  });
  it('allows [auto] and a leading [[align:…]] (not unfilled slots)', () => {
    expect(issueCredentialSchema.safeParse(cert({
      bodyParagraphs: ['[[align:center]]Interned with dmj.one. Document no. [auto].'],
    })).success).toBe(true);
  });
  it('rejects an unfilled [slot]', () => {
    expect(issueCredentialSchema.safeParse(cert({
      bodyParagraphs: ['interned from [start date] to [end date]'],
    })).success).toBe(false);
  });
  it('rejects a false-status term', () => {
    expect(issueCredentialSchema.safeParse(cert({
      bodyParagraphs: ['dmj.one, a registered company, certifies that…'],
    })).success).toBe(false);
  });
  it('rejects internship employment/salary language', () => {
    expect(issueCredentialSchema.safeParse(cert({
      bodyParagraphs: ['was an employee drawing a monthly salary.'],
    })).success).toBe(false);
  });
  it('does NOT block employment terms for a non-internship type', () => {
    expect(issueCredentialSchema.safeParse(cert({
      type: 'appreciation', title: 'APPRECIATION',
      bodyParagraphs: ['ran our salary-negotiation workshop with distinction.'],
    })).success).toBe(true);
  });
  // NOTE: the required issuer-attestation field is enforced end-to-end with the
  // admin-UI + pipeline wiring (a later task), so its rejection cases live there.
});

describe('issueLetterSchema — content guards', () => {
  it('accepts a clean, attested letter', () => {
    expect(issueLetterSchema.safeParse(letter()).success).toBe(true);
  });
  it('rejects an unfilled [slot]', () => {
    expect(issueLetterSchema.safeParse(letter({
      bodyParagraphs: ['associated as [role] from [start] to [end]'],
    })).success).toBe(false);
  });
  it('rejects a false-status term', () => {
    expect(issueLetterSchema.safeParse(letter({
      subject: 'Issued by dmj.one, an ISO certified institution',
    })).success).toBe(false);
  });
  it('blocks employment language when scope=internship (offer letter / internship LOR)', () => {
    expect(issueLetterSchema.safeParse(letter({
      scope: 'internship',
      bodyParagraphs: ['We offer you employment with a salary of ₹X.'],
    })).success).toBe(false);
    // Same words pass when not internship-scoped (no scope signal):
    expect(issueLetterSchema.safeParse(letter({
      bodyParagraphs: ['She advised our team on salary benchmarking.'],
    })).success).toBe(true);
  });
});
