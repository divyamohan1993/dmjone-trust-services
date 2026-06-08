/**
 * Kind-aware rendering of the public credential page (§D). The verdict / ledger
 * / trust / download scaffold is shared and already covered by app.test.ts; this
 * file pins the per-kind BRANCHES: the hero copy and the "details" grid for a
 * letter and an upload, the honest upload wording, and that hostile subject /
 * filename values are HTML-escaped on the public surface.
 *
 * The certificate face stays covered by app.test.ts (GET /c/:id) — these tests
 * deliberately do not re-assert it, so a regression there shows up where it
 * lives, not here.
 */

import { describe, expect, it } from 'vitest';
import { renderCredentialPage, type CredentialPageInput } from '../src/page.js';
import { makeLetterRecord, makeUploadRecord } from './fakes.js';
import type { CredentialRecord, VerificationChecks } from '@dmjone/shared';

const ALL_GOOD: VerificationChecks = {
  mldsaSignature: true,
  hashMatch: true,
  logInclusion: true,
  anchorProof: true,
  notRevoked: true,
};

function pageOf(record: CredentialRecord): string {
  const input: CredentialPageInput = {
    record,
    issuer: 'dmj.one Trust Services',
    issuerLegalName: 'dmj.one (independent educational initiative)',
    verifyBaseUrl: 'https://verify.dmj.one',
    nonce: 'test-nonce',
    verification: { outcome: 'valid', checks: { ...ALL_GOOD } },
  };
  return renderCredentialPage(input);
}

/** The page-wide invariants that must hold for EVERY kind (CSP, well-formedness). */
function assertSharedInvariants(html: string): void {
  expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  expect(html.trimEnd().endsWith('</html>')).toBe(true);
  // CSP: the nonce'd <style>/<script> are allowed; inline style="" / on*= are not.
  expect(html).not.toMatch(/\sstyle=/i);
  expect(html).not.toMatch(/\son\w+=/i);
  // The verdict + ledger scaffold is shared and present.
  expect(html).toContain('id="verdict"');
  expect(html).toContain('data-check="mldsaSignature"');
  // No handwritten-signature image and no GET link to the signed PDF, ever.
  expect(html).not.toMatch(/signature\.(png|jpg|jpeg|svg|webp)/i);
  expect(html).not.toMatch(/href=["'][^"']*\/api\/download/i);
}

describe('renderCredentialPage — letter (Mode 2)', () => {
  const html = pageOf(makeLetterRecord());

  it('satisfies the shared page invariants', () => {
    assertSharedInvariants(html);
  });

  it('renders a "Letter · <subject>" hero and addresses the recipient', () => {
    expect(html).toContain('Letter · Confirmation of Internship Completion');
    expect(html).toContain('The Principal'); // addressee summary
    // The full letter body is NEVER re-rendered on the public page (gated PDF only).
    expect(html).not.toContain('completed an internship with dmj.one');
  });

  it('shows letter document details (subject, recipient, date, issuer, id, status)', () => {
    expect(html).toContain('Document details');
    expect(html).toContain('<dt>Subject</dt><dd>Confirmation of Internship Completion</dd>');
    expect(html).toContain('<dt>Recipient</dt><dd>The Principal</dd>');
    expect(html).toContain('<dt>Issue date</dt><dd>04 June 2026</dd>');
    expect(html).toContain('<dt>Document ID</dt>');
    expect(html).toContain('DMJ-LTR-20260604-01');
    expect(html).toMatch(/class="pill valid"/);
  });

  it('uses the first recipient line as the headline when there is no subject', () => {
    const out = pageOf(makeLetterRecord({ subject: undefined }));
    expect(out).toContain('Letter · The Principal');
  });

  it('escapes a hostile subject on the public surface', () => {
    const out = pageOf(makeLetterRecord({ subject: 'Pwn <script>alert(1)</script> & "q"' }));
    expect(out).not.toContain('<script>alert(1)</script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('&amp;');
  });
});

describe('renderCredentialPage — upload (Mode 3)', () => {
  const html = pageOf(makeUploadRecord());

  it('satisfies the shared page invariants', () => {
    assertSharedInvariants(html);
  });

  it('renders an "Attested document · <filename>" hero', () => {
    expect(html).toContain('Attested document · offer-letter.pdf');
    expect(html).toContain('DMJ-DOC-20260604-01'); // document number in the hero
  });

  it('shows upload document details (number, filename, SHA-256, pages, date, status)', () => {
    expect(html).toContain('<dt>Document number</dt>');
    expect(html).toContain('DMJ-DOC-20260604-01');
    expect(html).toContain('<dt>File name</dt><dd>offer-letter.pdf</dd>');
    expect(html).toContain('<dt>Original SHA-256</dt>');
    expect(html).toContain('e'.repeat(64));
    expect(html).toContain('<dt>Pages</dt><dd>3</dd>');
    expect(html).toContain('<dt>Issue date</dt><dd>04 June 2026</dd>');
    expect(html).toMatch(/class="pill valid"/);
  });

  it('uses HONEST copy: dmj.one signed it, the content is the uploader\'s', () => {
    // Collapse runtime whitespace so the assertion is about the WORDS, not the
    // template's line wrapping.
    const flat = html.replace(/\s+/g, ' ').toLowerCase();
    expect(flat).toContain('attests that it signed this document');
    expect(flat).toContain("document's content is the uploader's");
  });

  it('escapes a hostile filename everywhere it appears (hero + details)', () => {
    const out = pageOf(
      makeUploadRecord({ originalFilename: 'evil <img src=x onerror=alert(1)> & "x".pdf' }),
    );
    // The angle brackets are neutralised, so the `<img>` is inert text, not an
    // element (the residual `onerror=` is then just escaped characters, harmless).
    expect(out).not.toContain('<img src=x onerror=alert(1)>');
    expect(out).toContain('&lt;img');
    expect(out).toContain('&amp;');
    expect(out).toContain('&quot;');
  });
});
