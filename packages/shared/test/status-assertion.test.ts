import { describe, it, expect } from 'vitest';
import {
  computeStatusAssertionPayload,
  computeCanonicalPayload,
  STATUS_ASSERTION_DOMAIN,
  STATUS_PAYLOAD_VERSION,
  type CredentialContent,
} from '../src/index.js';

describe('computeStatusAssertionPayload', () => {
  const base = { credentialId: 'DMJ-IC-20260615-01', status: 'valid' as const, asOf: '2026-06-15T00:00:00.000Z' };

  it('is deterministic for the same input', () => {
    expect(computeStatusAssertionPayload(base)).toBe(computeStatusAssertionPayload({ ...base }));
  });

  it('is domain-separated: starts with the status tag + newline', () => {
    const payload = computeStatusAssertionPayload(base);
    expect(payload.startsWith(STATUS_ASSERTION_DOMAIN + '\n')).toBe(true);
  });

  it('carries a version and all signed fields in canonical (key-sorted) JSON', () => {
    const json = computeStatusAssertionPayload(base).slice(STATUS_ASSERTION_DOMAIN.length + 1);
    expect(json).toBe(
      `{"asOf":"2026-06-15T00:00:00.000Z","credentialId":"DMJ-IC-20260615-01","status":"valid","v":${STATUS_PAYLOAD_VERSION}}`,
    );
    expect(JSON.parse(json)).toMatchObject({ v: STATUS_PAYLOAD_VERSION, credentialId: base.credentialId, status: 'valid' });
  });

  it('changes when status changes', () => {
    expect(computeStatusAssertionPayload(base)).not.toBe(
      computeStatusAssertionPayload({ ...base, status: 'revoked' }),
    );
  });

  it('changes when asOf changes', () => {
    expect(computeStatusAssertionPayload(base)).not.toBe(
      computeStatusAssertionPayload({ ...base, asOf: '2026-06-16T00:00:00.000Z' }),
    );
  });

  it('can NEVER collide with a credential canonical payload (domain separation by construction)', () => {
    const content: CredentialContent = {
      credentialId: base.credentialId,
      type: 'internship',
      issueDate: '2026-06-15',
      kicker: 'Certificate of',
      title: 'INTERNSHIP',
      intro: 'This is to certify that',
      recipientName: 'Test User',
      bodyParagraphs: ['Body.'],
      signatory: { name: 'X', role: 'Y', phone: 'Z' },
    };
    const credentialPayload = computeCanonicalPayload(content, 'a'.repeat(64));
    const statusPayload = computeStatusAssertionPayload(base);
    // Credential payloads are bare canonical JSON (start with '{'); status
    // assertions carry the domain tag first. Disjoint by first character.
    expect(credentialPayload.startsWith('{')).toBe(true);
    expect(statusPayload.startsWith('{')).toBe(false);
    expect(statusPayload).not.toBe(credentialPayload);
  });
});
