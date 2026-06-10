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
import { makeLetterRecord, makeRecord, makeUploadRecord } from './fakes.js';
import type { CredentialRecord, VerificationChecks, VerificationOutcome } from '@dmjone/shared';

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

  // Court-ready evidence bundle: a download action is ALWAYS offered, pointing at
  // the new /evidence endpoint. The label is the sanctioned "court-ready"
  // (forensic-evidence) framing, never an overclaim.
  expect(html).toContain('id="dl-evidence"');
  expect(html).toMatch(/href="\/api\/credentials\/[^"]*\/evidence"/);
  expect(flat).toMatch(/court-ready evidence bundle/i);
  // Honesty guard EXTENDED to all the new copy: no forbidden phrases anywhere on
  // the page (the page surfaces the timestamp + the bundle link).
  expect(flat).not.toMatch(/court-proof/i);
  expect(flat).not.toMatch(/legally guaranteed/i);
  expect(flat).not.toMatch(/valid in court/i);
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

  it('does NOT show the upload file-gate (certificates/letters keep their id/QR verdict)', () => {
    // The anti-spoof file gate is upload-only: certs/letters display authoritative
    // content the verifier can compare, so the id/QR verdict stays meaningful.
    expect(html).not.toContain('id="fc-form"');
    expect(html).toContain('data-filegate="0"');
  });
});

describe('renderCredentialPage — upload (Mode 3)', () => {
  const html = pageOf(makeUploadRecord());

  it('satisfies the shared page invariants', () => {
    assertSharedInvariants(html);
  });

  it('renders an "Attested Document" hero: category eyebrow, humanised doc name, type chip + number', () => {
    // The category is the eyebrow ONCE — no longer doubled into a force-uppercased
    // headline that turned a long filename into an unreadable all-caps blob.
    expect(html).toContain('<p class="eyebrow">Attested Document</p>');
    // The headline is the filename as a dignified document name: extension dropped,
    // separators collapsed to spaces, original case preserved, NOT force-uppercased.
    expect(html).toContain('<h1 class="type-title doc-name" id="cred-title">offer letter</h1>');
    // The extension is a small chip; the document number sits in the calm meta line.
    expect(html).toContain('<span class="filechip">PDF</span>');
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

  it('does NOT assert the FILE is authentic from the id/QR alone (anti-spoof file gate)', () => {
    // An upload shows no human-comparable content, so a scanned QR/number must not
    // inherit a green "valid" verdict — a copied QR on a forged file would too.
    expect(html).toContain('data-filegate="1"');
    expect(html).toContain('<div class="verdict unconfirmed" id="verdict">');
    expect(html).not.toContain('<div class="verdict valid" id="verdict">');
    expect(html).toContain('Confirm your copy.');
    // The decisive check: drop the actual bytes → POST /api/verify/file.
    expect(html).toContain('id="fc-form"');
    expect(html).toContain('action="/api/verify/file"');
    expect(html).toContain('type="file"');
    // The spoof is named in plain words, and the attested fingerprint is shown as
    // exactly what the held file must match, byte-for-byte.
    const flat = html.replace(/\s+/g, ' ');
    expect(flat).toMatch(/copied onto any file/i);
    expect(flat).toMatch(/byte-for-byte/i);
    // The dropzone fingerprint is shown MASKED (head + tail), never the full hash —
    // the server compares the full hash against its record, so the display is only
    // reassurance. (The full record fingerprint lives in the details grid.)
    expect(html).not.toContain('a'.repeat(64));
    expect(html).toContain('aaaaaaaaaa…aaaaaa');
    // The DECISIVE file-integrity check is an explicit row, NEUTRAL until the
    // verifier provides the file — never rendered as already passed from id/QR.
    expect(html).toContain('data-check="hashMatch" data-filecheck="1"');
    expect(flat).toMatch(/Awaiting your file/i);
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

/**
 * HARD REQUIREMENT (VERIFY's settled checkAnchor semantics): a `false` external
 * anchor must render as a CALM "pending", NEVER a red "failed" check. VERIFY's
 * stricter anchorProof (true only on a real GitHub publication that covers the
 * record) makes `false` COMMON on genuinely VALID documents — every record issued
 * before anchoring was configured, and every prior record after a single transient
 * publish failure, reads false until the next successful publish. anchorProof is
 * informational and NEVER gates the verdict, so a valid doc with anchorProof:false
 * is still VALID. Rendering that false as red would turn a real, valid certificate
 * alarmingly red — the exact recipient-scare the whole drop-PAdES effort removes.
 */
describe('renderCredentialPage — a false external anchor renders as PENDING, never red/failed', () => {
  it('paints anchorProof:false as the soft "warn"/Pending state (not "fail"), verdict stays VALID', () => {
    const html = pageWithChecks({ ...ALL_GOOD, anchorProof: false });
    // The anchor row MUST be the soft amber 'warn' (Pending), never red 'fail'.
    expect(html).toContain('data-check="anchorProof" class="warn"');
    expect(html).not.toContain('data-check="anchorProof" class="fail"');
    // Its assistive-tech status word is the calm "Pending", never "Failed".
    const anchorLi = /<li data-check="anchorProof"[^>]*>.*?<\/li>/s.exec(html)?.[0] ?? '';
    expect(anchorLi).toContain('Pending');
    expect(anchorLi).not.toContain('Failed');
    // anchorProof is NOT a gate: the SSR verdict is still VALID (gold), not downgraded.
    expect(html).toMatch(/class="pill valid"/);
    expect(html).toContain('data-ssr-outcome="valid"');
  });

  it('still renders the genuinely-gating checks as red when THEY fail (mldsaSignature false → fail)', () => {
    // Contrast guard: the never-red rule is specific to anchorProof. A real
    // authenticity failure (mldsaSignature) SHOULD render 'fail' — otherwise the
    // page would hide a true problem. This pins that the warn-not-fail logic is
    // scoped to the anchor, not blanket-applied.
    const html = pageWithChecks({ ...ALL_GOOD, mldsaSignature: false });
    expect(html).toContain('data-check="mldsaSignature" class="fail"');
  });

  it('the pending state promises NO scheduled/auto re-anchor job (none exists in the codebase)', () => {
    const html = pageWithChecks({ ...ALL_GOOD, anchorProof: false });
    const flat = html.replace(/\s+/g, ' ').toLowerCase();
    // There is no cron/scheduler; "will be re-anchored by the scheduled job" is an
    // aspirational issuer LOG string only. The public page must not imply one.
    expect(flat).not.toMatch(/scheduled job/);
    expect(flat).not.toMatch(/re-?anchored automatically/);
    expect(flat).not.toMatch(/anchored shortly/);
    expect(flat).not.toMatch(/background (job|process|task)/);
  });
});

/**
 * The trusted-timestamp line is CONDITIONAL and HONEST: it appears ONLY when the
 * route handler verified an RFC-3161 token for the record, names WHEN the
 * signature existed, and explicitly disclaims being a legal guarantee. Absent
 * input ⇒ nothing is rendered (no token, or one that failed to verify). The
 * subject comes from a TSA cert, so it must be HTML-escaped on this surface.
 */
function pageWithTimestamp(ts?: { genTime?: string; tsaSubject?: string }): string {
  const input: CredentialPageInput = {
    record: makeLetterRecord(),
    issuer: 'dmj.one Trust Services',
    issuerLegalName: 'dmj.one (independent educational initiative)',
    verifyBaseUrl: 'https://verify.dmj.one',
    nonce: 'test-nonce',
    verification: { outcome: 'valid', checks: { ...ALL_GOOD } },
    ...(ts ? { trustedTimestamp: ts } : {}),
  };
  return renderCredentialPage(input);
}

describe('renderCredentialPage — trusted-timestamp line (conditional + honest)', () => {
  it('renders ONE honest, conditional line when a verified timestamp is present', () => {
    const html = pageWithTimestamp({
      genTime: '2026-06-04T10:00:05.000Z',
      tsaSubject: 'CN=freeTSA, O=freeTSA.org',
    });
    const flat = html.replace(/\s+/g, ' ');
    expect(html).toContain('trust-ts');
    expect(flat).toMatch(/Independently timestamped by CN=freeTSA, O=freeTSA\.org/);
    expect(flat).toContain('2026-06-04T10:00:05.000Z');
    // RFC-3161, rendered with a non-breaking hyphen entity (&#8209;) for typography.
    expect(flat).toMatch(/RFC(&#8209;|.{0,2})3161/);
    // Honest scope: it is forensic evidence of WHEN, explicitly NOT a legal guarantee.
    expect(flat).toMatch(/independently-verifiable forensic evidence/i);
    expect(flat).toMatch(/not a legal guarantee/i);
    // Never an overclaim.
    expect(flat).not.toMatch(/court-proof/i);
    expect(flat).not.toMatch(/legally guaranteed/i);
    expect(flat).not.toMatch(/valid in court/i);
  });

  it('renders NOTHING when no verified timestamp is provided (legacy / TSA outage)', () => {
    const html = pageWithTimestamp(); // no trustedTimestamp at all
    expect(html).not.toContain('trust-ts');
    expect(html).not.toMatch(/Independently timestamped/i);
  });

  it('HTML-escapes a hostile TSA subject (it comes from a certificate)', () => {
    const html = pageWithTimestamp({
      genTime: '2026-06-04T10:00:05.000Z',
      tsaSubject: 'CN=<script>alert(1)</script> & "x"',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    // Still survives its own CSP (no inline style/handlers introduced by the line).
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/\son\w+=/i);
  });
});

describe('renderCredentialPage — court-ready evidence bundle download link', () => {
  it('offers the evidence download next to the §63 download, for every kind', () => {
    for (const html of [pageOf(makeLetterRecord()), pageOf(makeUploadRecord())]) {
      // Both actions present; the evidence link points at the /evidence endpoint.
      expect(html).toContain('id="dl-63"');
      expect(html).toContain('id="dl-evidence"');
      expect(html).toMatch(/href="\/api\/credentials\/[^"]*\/evidence"/);
      expect(html.replace(/\s+/g, ' ')).toMatch(/court-ready evidence bundle/i);
    }
  });
});

/**
 * Render a certificate page at an arbitrary outcome (the default fakes are all
 * 'valid'). The checks are made internally consistent with the outcome so the
 * SSR ledger and verdict agree, the same way the route handler would feed them.
 */
function certPageWithOutcome(
  outcome: VerificationOutcome,
  overrides: { trustedTimestamp?: { genTime?: string; tsaSubject?: string } } = {},
): string {
  const checks: VerificationChecks = {
    ...ALL_GOOD,
    notRevoked: outcome !== 'revoked',
    hashMatch: outcome !== 'tampered',
    mldsaSignature: outcome !== 'unknown',
  };
  const input: CredentialPageInput = {
    record: makeRecord(),
    issuer: 'dmj.one Trust Services',
    issuerLegalName: 'dmj.one (independent educational initiative)',
    verifyBaseUrl: 'https://verify.dmj.one',
    nonce: 'test-nonce',
    verification: { outcome, checks },
    ...(overrides.trustedTimestamp ? { trustedTimestamp: overrides.trustedTimestamp } : {}),
  };
  return renderCredentialPage(input);
}

/**
 * TIER 1 — bad states must read as a WARNING at a glance. The verdict word LEADS
 * with the warning (never "Genuine, but…"), the hero carries a colour-independent
 * warning GLYPH that fills the seal's slot (so a bad verdict is never a few red
 * words floating in a void), and the credential identity is DEMOTED (struck /
 * dimmed) so a forgery is not dressed up in full prestige.
 */
describe('renderCredentialPage — bad-state gravity (Tier 1 safety)', () => {
  it('REVOKED leads with the warning word + an alarm glyph, never "Genuine, but…"', () => {
    const html = certPageWithOutcome('revoked');
    // The leading word is the warning itself — the eye must NOT land on "Genuine".
    expect(html).toContain('<span id="verdict-word">Revoked.</span>');
    expect(html).not.toMatch(/Genuine, but/i);
    // The exact (no em-dash, house-style) sub, leading with the withdrawal.
    expect(html).toContain('Issued by dmj.one, then withdrawn. Do not rely on it.');
    // The revoked SUB itself uses a period, not the spec's em dash (house style).
    const revokedSub = /<p class="sub" id="verdict-sub">([^<]*)<\/p>/.exec(html)?.[1] ?? '';
    expect(revokedSub).not.toContain('—');
    expect(revokedSub).toContain('withdrawn. Do not rely');
    // The colour-independent warning glyph (circled slash) is present in the hero.
    expect(html).toContain('<div class="verdict revoked" id="verdict">');
    expect(html).toContain('class="glyph" aria-hidden="true">⊘');
    // No gold: the seal class is present but CSS-gated off for non-valid (verified
    // via the verdict NOT carrying the .valid class the seal reveal needs).
    expect(html).not.toContain('class="verdict valid');
  });

  it('TAMPERED leads with "Altered." + a cross glyph and a do-not-rely sub', () => {
    const html = certPageWithOutcome('tampered');
    expect(html).toContain('<span id="verdict-word">Altered.</span>');
    expect(html).toContain('This does not match what was signed. Do not rely on it.');
    expect(html).toContain('<div class="verdict bad" id="verdict">');
    expect(html).toContain('class="glyph" aria-hidden="true">✕'); // ✕
  });

  it('UNKNOWN is neutral ("Not confirmed.") with a non-alarm glyph', () => {
    const html = certPageWithOutcome('unknown');
    expect(html).toContain('<span id="verdict-word">Not confirmed.</span>');
    expect(html).toContain("We couldn't confirm this. Check the ID or contact the issuer.");
    expect(html).toContain('<div class="verdict unknown" id="verdict">');
  });

  it('CSS fills the medallion slot on bad states + demotes the identity (no void, not dressed up)', () => {
    const html = certPageWithOutcome('revoked');
    // The glyph is un-hidden + enlarged ONLY on revoked/bad/unknown (NOT :not(.valid),
    // which would wrongly light up the upload .unconfirmed file-gate).
    expect(html).toMatch(/\.hero \.verdict\.revoked \.glyph[\s\S]*?\.hero \.verdict\.unknown \.glyph\{order:-1;display:grid/);
    expect(html).not.toMatch(/\.hero \.verdict:not\(\.valid\) \.glyph\{display:grid/);
    // The identity is demoted on a bad state via :has() on the live verdict class.
    expect(html).toMatch(/\.hero__core:has\(\.verdict\.revoked\) \.identity/);
    expect(html).toMatch(/\.hero__core:has\(\.verdict\.bad\) \.type-title[\s\S]*?line-through/);
    // The seal reveal stays gated to .valid only (no gold on bad states).
    expect(html).toContain('.hero .verdict:not(.valid) .seal{display:none}');
  });
});

/**
 * TIER 1/2 — the affirmative hero must show EVIDENCE + prompt scrutiny + carry the
 * honesty disclaimer, so a copied-QR forgery showing the TRUE record is not simply
 * crowned "Genuine." with nothing more.
 */
describe('renderCredentialPage — affirmative hero lines (Tier 1+2)', () => {
  it('VALID certificate shows the hard-fact (#5), the compare prompt (#2), and the honesty line (#3)', () => {
    const html = certPageWithOutcome('valid');
    const flat = html.replace(/\s+/g, ' ');
    // (#5) hard-fact — names EXACTLY what a valid outcome proves; never "all N checks
    // passed" (the anchor may be pending — that honesty is locked in the next test).
    expect(html).toContain('class="hardfact"');
    expect(flat).toMatch(/Post-quantum signature verified, recorded in the transparency log, not revoked\./);
    // (#2) certificate comparison — the cert analogue of the upload file-gate.
    expect(html).toContain('class="compare"');
    expect(flat).toMatch(/Confirm the name, date and details below match the document you/);
    // (#3) honesty line, surfaced BY the verdict (compact, no em dash).
    expect(html).toContain('class="honesty"');
    expect(flat).toMatch(/an independent educational initiative, not a government-licensed certifying authority/);
  });

  it('the hard-fact NEVER claims "all 4/N checks passed" (anchor may be pending — honesty lock)', () => {
    // A valid doc routinely has anchorProof:false (pending); a hardcoded "all 4
    // passed" would be FALSE and contradict the ledger. Pin that we do not say it.
    const html = certPageWithOutcome('valid');
    const flat = html.replace(/\s+/g, ' ');
    expect(flat).not.toMatch(/all (4|four|the) (cryptographic )?checks passed/i);
  });

  it('appends the independent timestamp to the hard-fact ONLY when a verified token is present', () => {
    const withTs = certPageWithOutcome('valid', {
      trustedTimestamp: { genTime: '2026-06-04T10:00:05.000Z', tsaSubject: 'CN=freeTSA' },
    }).replace(/\s+/g, ' ');
    // Dated to the day (compact); the full token detail stays in the trust line below.
    expect(withTs).toMatch(/independently timestamped 04 June 2026/);
    // Absent token ⇒ the hard-fact carries no timestamp clause.
    const noTs = certPageWithOutcome('valid').replace(/\s+/g, ' ');
    expect(noTs).not.toMatch(/independently timestamped/i);
  });

  it('does NOT show the affirmative hard-fact / compare lines on a bad state', () => {
    for (const outcome of ['revoked', 'tampered', 'unknown'] as const) {
      const html = certPageWithOutcome(outcome);
      expect(html).not.toContain('class="hardfact"');
      expect(html).not.toContain('class="compare"');
      // The honesty line, however, shows in EVERY state.
      expect(html).toContain('class="honesty"');
    }
  });

  it('does NOT add the cert-compare line to UPLOADS (they have the byte-level file-gate)', () => {
    // A valid upload is file-gated (verdict "unconfirmed"); neither the affirmative
    // hard-fact nor the cert-compare line belongs there.
    const html = pageOf(makeUploadRecord());
    expect(html).toContain('data-filegate="1"');
    expect(html).not.toContain('class="compare"');
    expect(html).not.toContain('class="hardfact"');
    // But the honesty line is still surfaced.
    expect(html).toContain('class="honesty"');
  });

  it('NEVER defaces the attested doc-name on a file MISMATCH (record is genuine; the FILE is wrong)', () => {
    // A file mismatch repaints the verdict to .bad, which would otherwise strike /
    // dim the hero title via the bad-state demotion. On a file-gate page the title
    // is the ATTESTED document's name (genuine), so a file-gate-scoped override (at
    // higher specificity) resets the demotion — the ✕ glyph + word carry the alarm.
    const html = pageOf(makeUploadRecord());
    expect(html).toContain('body[data-filegate="1"] .hero__core:has(.verdict.bad) .identity{opacity:1;filter:none}');
    expect(html).toContain('body[data-filegate="1"] .hero__core:has(.verdict.bad) .type-title{text-decoration:none}');
  });

  it('the honesty line carries no forbidden overclaim and survives CSP', () => {
    const flat = certPageWithOutcome('valid').replace(/\s+/g, ' ');
    expect(flat).not.toMatch(/court-proof/i);
    expect(flat).not.toMatch(/legally guaranteed/i);
    expect(flat).not.toMatch(/valid in court/i);
    // No inline style/handlers introduced by the new lines.
    const html = certPageWithOutcome('valid');
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/\son\w+=/i);
  });
});

/**
 * TIER 2 — the badge must INFORM, not echo the human verdict word, and the hero
 * jargon gets plain glosses. The lifecycle pill keeps its term (lifecycle, not a
 * restatement) — app.test.ts pins >VALID</>UNKNOWN< + class="pill valid".
 */
describe('renderCredentialPage — vocabulary (Tier 2)', () => {
  it('the VALID badge note states the technical fact without restating "Genuine"', () => {
    const html = certPageWithOutcome('valid');
    const noteEl = /<span id="status-note">([^<]*)<\/span>/.exec(html)?.[1] ?? '';
    expect(noteEl).not.toMatch(/genuine/i);
    expect(noteEl).toMatch(/post-quantum signature .*verifies against this record/i);
    // It must NOT claim every row passes (the anchor row may be Pending — honesty).
    expect(noteEl).not.toMatch(/every check|all (4|four|the) checks/i);
    // The label is still the shared lifecycle term (pill + checks share it).
    expect(html).toContain('<b id="status-label">VALID</b>');
  });
});
