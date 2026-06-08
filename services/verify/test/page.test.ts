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

  // Legal accuracy: the page must NOT claim the delivered PDF carries an embedded
  // digital signature (PAdES/PKCS#7) — that object was removed. Authenticity is
  // the DETACHED ML-DSA-87 signature + transparency log + external anchor, and
  // it stays an honest, self-signed (non-licensed-CA) attestation.
  expect(html).not.toMatch(/PAdES|PKCS#?7/i);
  const flat = html.replace(/\s+/g, ' ');
  expect(flat).toContain('detached post-quantum');
  expect(flat).toContain('carries no embedded signature');
  expect(flat).toMatch(/self-signed cryptographic attestation/i);
  // Tags removed so the "not a licensed certifying-authority DSC" disclaimer is
  // matched as words, regardless of the <strong> wrapping on "not".
  const text = flat.replace(/<[^>]+>/g, '');
  expect(text).toMatch(/not a licensed certifying-authority Digital Signature Certificate/i);

  // External anchor: NAMED (concrete repo) + stated CONDITIONALLY (LOCKED — the
  // anchor token expires/ is best-effort, so affirmative prose would silently go
  // false on lapse; conditional stays true in every state), with the per-document
  // best-effort caveat (published or pending). The repo is operated BY dmj.one, so
  // it must NOT be framed as an independent third party, and the inactive
  // OTS/Bitcoin path must not appear.
  expect(flat).toContain('public GitHub repository');
  expect(flat).toContain('github.com/divyamohan1993/dmjone-trust-anchor');
  expect(flat).toMatch(/where external anchoring is enabled/i);
  expect(flat).toMatch(/best-effort/i);
  expect(flat).toMatch(/published or still pending/i);
  expect(flat).not.toMatch(/independent (public |external )?(repository|system)/i);
  expect(flat).not.toMatch(/OpenTimestamps|Bitcoin/i);
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

/**
 * The embedded-PAdES indicator must NEVER appear as a negative/red row on the
 * public page. Dropping the embedded PKCS#7 signature exists precisely to kill
 * the reader's "Invalid Signature" scare, so a `padesSignature:false` (or absent)
 * value must paint NOTHING — no failed/missing row. A green "publisher signature"
 * bonus is permitted ONLY when `padesSignature === true`; this guard deliberately
 * does NOT forbid that future positive badge, only the red-capable check row.
 *
 * On THIS surface (`/c/:id`), the verdict rests solely on the four authoritative
 * checks (ML-DSA-87, log inclusion, anchor, not-revoked); `padesSignature` is not
 * even computed here (app.ts `buildChecks` omits it), so it is always undefined.
 * We still pass an explicit `false` to exercise the "false must not render red"
 * path rather than passing trivially by absence.
 */
function pageWithChecks(checks: VerificationChecks): string {
  const input: CredentialPageInput = {
    record: makeLetterRecord(),
    issuer: 'dmj.one Trust Services',
    issuerLegalName: 'dmj.one (independent educational initiative)',
    verifyBaseUrl: 'https://verify.dmj.one',
    nonce: 'test-nonce',
    verification: { outcome: 'valid', checks },
  };
  return renderCredentialPage(input);
}

describe('renderCredentialPage — PAdES indicator is never a red/negative row', () => {
  it('renders no padesSignature CHECK ROW even when padesSignature is explicitly false', () => {
    const html = pageWithChecks({ ...ALL_GOOD, padesSignature: false });
    // `data-check="padesSignature"` is the ONLY red-capable path (checkClass maps
    // false → 'fail'). Its absence is what guarantees "never red"; a permitted
    // green badge would not be a data-check <li>, so this does not block it.
    expect(html).not.toContain('data-check="padesSignature"');
    // And the four authoritative rows ARE the verdict story shown to the user.
    expect(html).toContain('data-check="mldsaSignature"');
    expect(html).toContain('data-check="logInclusion"');
    expect(html).toContain('data-check="anchorProof"');
    expect(html).toContain('data-check="notRevoked"');
  });

  it('renders no padesSignature row when padesSignature is absent (the real /c/:id case)', () => {
    const html = pageWithChecks({ ...ALL_GOOD }); // padesSignature undefined
    expect(html).not.toContain('data-check="padesSignature"');
    // No negative "signature failed/invalid/missing" scare text on the page.
    const flat = html.replace(/\s+/g, ' ').toLowerCase();
    expect(flat).not.toContain('signature could not be verified');
    expect(flat).not.toContain('invalid signature');
    expect(flat).not.toContain('signature missing');
  });
});
