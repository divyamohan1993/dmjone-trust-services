/**
 * The public credential page — artifact B from the spec: deliberately distinct
 * from the gated PDF. Where the PDF is a paper letterhead, this is a web-native
 * verification *experience*: the verdict seats into place like a vault tumbler,
 * a three-tier verdict (plain sentence → cryptographic ledger → §63 facts), an
 * honest trust statement, the §63 download, and a password-gated download panel.
 *
 * Hard rules enforced here:
 *  - NO handwritten-signature image, NO direct certificate-PDF link. The
 *    signature lives only inside the gated PDF.
 *  - The verdict and HR/legal fields are rendered SERVER-SIDE so the page is
 *    meaningful with JavaScript off, screen-reader friendly, and
 *    court-presentable. The settle/seal motion is pure progressive enhancement
 *    over /api/verify/:id; it only re-paints a result that is already
 *    authoritative server-side.
 *  - Honest wording: self-signed cryptographic attestation by an independent
 *    educational initiative — never a claim of a licensed-CA DSC or government
 *    accreditation.
 *  - Nonce CSP: the single inline <style> and <script> carry the request nonce;
 *    no inline event handlers, no style="" attributes (they would be blocked by
 *    our own CSP).
 *
 * The entire stylesheet is the shared "Sealed Instrument" design system from
 * @dmjone/brand, so this surface and the PDF stay in lockstep on palette, the
 * four serif families, the gold double-frame, and the diamond corner studs.
 */

import { IDENTITY, designSystemCss } from '@dmjone/brand';
import type {
  CredentialContent,
  CredentialRecord,
  LetterContent,
  UploadAttestation,
  VerificationChecks,
  VerificationOutcome,
} from '@dmjone/shared';
import { documentKind, titleCase } from '@dmjone/shared';
import { escapeHtml } from './escape.js';

/** Human label for each credential type code. */
const TYPE_LABEL: Record<string, string> = {
  internship: 'Internship',
  completion: 'Completion',
  appreciation: 'Appreciation',
  experience: 'Experience',
  participation: 'Participation',
};

/** "2026-06-04" → "04 June 2026" (stable, locale-independent). */
function formatIssueDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const year = m[1];
  const monthIdx = Number(m[2]) - 1;
  const day = m[3];
  const month = months[monthIdx] ?? m[2];
  return `${day} ${month} ${year}`;
}

export interface CredentialPageInput {
  record: CredentialRecord;
  issuer: string;
  issuerLegalName: string;
  verifyBaseUrl: string;
  nonce: string;
  /** Server-computed verdict, so the no-JS badge is a real cryptographic result. */
  verification: { outcome: VerificationOutcome; checks: VerificationChecks };
}

/** The four corner studs of the ornamental card — decorative jewels only. */
function studs(): string {
  return `        <span class="stud tl" aria-hidden="true"></span><span class="stud tr" aria-hidden="true"></span><span class="stud bl" aria-hidden="true"></span><span class="stud br" aria-hidden="true"></span>`;
}

/** A flourish divider: two fade-to-gold rules flanking a single gold diamond. */
function flourish(): string {
  return `      <div class="flourish" aria-hidden="true"><i></i></div>`;
}

/**
 * Tier 1 — the plain-language verdict. A full human sentence a non-technical
 * recruiter reads in one second, scoped so it never overclaims a self-signed
 * attestation. The `.verdict` carries the outcome class server-side so it is
 * correct (and final) with JavaScript off.
 */
function verdictCopy(
  outcome: VerificationOutcome,
): { cls: string; word: string; sub: string; glyph: string } {
  switch (outcome) {
    case 'valid':
      return {
        cls: 'valid',
        word: 'Genuine.',
        sub: 'Issued by dmj.one Trust Services, and unaltered since.',
        glyph: '✓', // check
      };
    case 'revoked':
      return {
        cls: 'revoked',
        word: 'Genuine, but revoked.',
        sub: 'Issued by us, but withdrawn. Do not rely on it.',
        glyph: '✕', // cross
      };
    case 'tampered':
      return {
        cls: 'bad',
        word: 'Altered. Do not rely on this.',
        sub: 'The data shown does not match what was signed.',
        glyph: '✕', // cross
      };
    default:
      return {
        cls: 'unknown',
        word: 'Not confirmed.',
        sub: 'We could not confirm this credential. Check the ID or contact the issuer.',
        glyph: '–', // en dash: neutral, never alarm (aria-hidden)
      };
  }
}

/** Map an outcome to its badge presentation (class + label + note). */
function outcomeBadge(
  outcome: VerificationOutcome,
  issuer: string,
): { cls: string; label: string; note: string } {
  switch (outcome) {
    case 'valid':
      return {
        cls: 'valid',
        label: 'VALID',
        note: `Cryptographically attested by ${issuer}, untampered, and recorded in the transparency log.`,
      };
    case 'revoked':
      return {
        cls: 'revoked',
        label: 'REVOKED',
        note: `This credential was issued by ${issuer} but has since been revoked. It should not be relied upon.`,
      };
    case 'tampered':
      return {
        cls: 'bad',
        label: 'TAMPERED',
        note: 'The verified data does not match what was signed.',
      };
    default:
      return {
        cls: 'unknown',
        label: 'UNKNOWN',
        note: `We could not confirm this credential's cryptographic integrity. Contact ${issuer}.`,
      };
  }
}

/** CSS class for a single check given its boolean (anchor-pending shows as a soft warning). */
function checkClass(key: string, value: boolean | undefined): string {
  if (key === 'anchorProof' && value === false) return 'warn';
  if (value === true) return 'pass';
  if (value === false) return 'fail';
  return '';
}

/**
 * The kind-aware face of the public page: the browser-tab title, the hero block
 * (eyebrow / title / recipient line) inside the card, and the rows of the
 * "Credential details" grid. The verdict, the cryptographic ledger, the honest
 * trust statement, the §63 + gated downloads, and the tamper explainer are
 * shared across all kinds and stay outside this branch.
 *
 * `record.id` is the document id for every kind, so the id row + downloads use
 * it directly without reaching into the kind-specific `credentialId`/`documentId`
 * fields. The `statusPill` is rendered by the caller (it needs the verdict). One
 * line per `<dt>/<dd>` keeps the grid markup identical in shape to today's
 * certificate; only the labels/values differ. Every field is HTML-escaped here;
 * none of these helpers emit a `style=""` attribute (CSP authorises the nonce'd
 * <style> element only, never inline styles).
 */
interface PageFace {
  /** <title> text (already plain; escaped by head()). */
  pageTitle: string;
  /** The card hero: eyebrow + headline + the optional recipient/summary line. */
  hero: string;
  /** The <dt>/<dd> rows of the details grid, EXCLUDING the trailing status row. */
  detailRows: string;
}

function certificateFace(c: CredentialContent, issued: string, issuer: string, id: string): PageFace {
  const typeLabel = TYPE_LABEL[c.type] ?? titleCase(c.type);
  return {
    pageTitle: `${typeLabel} certificate · ${c.recipientName} · ${IDENTITY.trustService}`,
    hero: `        <p class="eyebrow">${escapeHtml(c.kicker)}</p>
        <h1 class="type-title" id="cred-title">${escapeHtml(c.title)}</h1>
        <p class="recipient"><span class="lbl">${escapeHtml(c.intro)}</span>${escapeHtml(c.recipientName)}</p>`,
    detailRows: `          <dt>Recipient</dt><dd>${escapeHtml(c.recipientName)}</dd>
          <dt>Credential</dt><dd>${escapeHtml(c.kicker)} ${escapeHtml(c.title)}</dd>
          <dt>Type</dt><dd>${escapeHtml(typeLabel)}</dd>
          <dt>Issue date</dt><dd>${escapeHtml(issued)}</dd>
          <dt>Issuer</dt><dd>${escapeHtml(issuer)}</dd>
          <dt>Credential ID</dt><dd><code class="mono">${escapeHtml(id)}</code></dd>`,
  };
}

function letterFace(c: LetterContent, issued: string, issuer: string, id: string): PageFace {
  // The hero headline is the subject if present, else the first recipient line,
  // else a neutral fallback — never the full letter body (that lives only in the
  // gated PDF). The recipient line shows the addressee summary, not the body.
  const headline = (c.subject ?? c.recipientLines[0] ?? 'Letter').trim() || 'Letter';
  const addressee = (c.recipientLines[0] ?? '').trim();
  return {
    pageTitle: `Letter · ${headline} · ${IDENTITY.trustService}`,
    hero: `        <p class="eyebrow">Letterhead · Trusted Document</p>
        <h1 class="type-title" id="cred-title">Letter · ${escapeHtml(headline)}</h1>
        ${addressee ? `<p class="recipient"><span class="lbl">To</span>${escapeHtml(addressee)}</p>` : ''}`,
    detailRows: `${c.subject ? `          <dt>Subject</dt><dd>${escapeHtml(c.subject)}</dd>\n` : ''}${
      addressee ? `          <dt>Recipient</dt><dd>${escapeHtml(addressee)}</dd>\n` : ''
    }          <dt>Issue date</dt><dd>${escapeHtml(issued)}</dd>
          <dt>Issuer</dt><dd>${escapeHtml(issuer)}</dd>
          <dt>Document ID</dt><dd><code class="mono">${escapeHtml(id)}</code></dd>`,
  };
}

function uploadFace(c: UploadAttestation, issued: string, issuer: string, id: string): PageFace {
  const filename = (c.originalFilename || 'Uploaded document').trim() || 'Uploaded document';
  return {
    pageTitle: `Attested document · ${filename} · ${IDENTITY.trustService}`,
    hero: `        <p class="eyebrow">Attested document · Trusted Document</p>
        <h1 class="type-title" id="cred-title">Attested document · ${escapeHtml(filename)}</h1>
        <p class="recipient"><span class="lbl">Document number</span>${escapeHtml(id)}</p>`,
    detailRows: `          <dt>Document number</dt><dd><code class="mono">${escapeHtml(id)}</code></dd>
          <dt>File name</dt><dd>${escapeHtml(filename)}</dd>
          <dt>Original SHA-256</dt><dd><code class="mono">${escapeHtml(c.originalSha256)}</code></dd>
          <dt>Pages</dt><dd>${escapeHtml(String(c.pageCount))}</dd>
          <dt>Issue date</dt><dd>${escapeHtml(issued)}</dd>
          <dt>Issuer</dt><dd>${escapeHtml(issuer)}</dd>`,
  };
}

/** Honest, kind-specific copy for the shared trust statement's lead sentence. */
function trustLead(kind: ReturnType<typeof documentKind>, issuerLegalName: string): string {
  switch (kind) {
    case 'upload':
      // The content is the uploader's; dmj.one attests only that it signed THIS file.
      return `<strong>${escapeHtml(issuerLegalName)}</strong> attests that it signed this document; the
        document's content is the uploader's, not authored or endorsed by dmj.one.`;
    case 'letter':
      return `<strong>${escapeHtml(issuerLegalName)}</strong> issued and attests to this letter.`;
    default:
      return `<strong>${escapeHtml(issuerLegalName)}</strong> attests to this credential.`;
  }
}

/**
 * The shared <head> + the single nonce'd design-system stylesheet, parameterised
 * by the per-request nonce. The CSS comes verbatim from @dmjone/brand so the web
 * surface never drifts from the printed certificate; the fonts it references are
 * served same-origin from the in-memory /fonts/:file route (font-src 'self').
 */
function head(nonce: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex">
<link rel="preload" as="font" type="font/woff2" href="/fonts/playfair-display-latin-700-normal.woff2" crossorigin>
<style nonce="${nonce}">
${designSystemCss().replace(/\/\*[\s\S]*?\*\//g, '')}
</style>
</head>`;
}

/** The branded 404 page (HTML, not JSON) for an unknown / malformed id. */
export function renderErrorPage(input: { nonce: string; issuer: string }): string {
  const { nonce, issuer } = input;
  // Neutral, never alarm-red: a mistyped QR is not a forgery.
  const v = verdictCopy('unknown');
  return `${head(nonce, `Credential not found · ${IDENTITY.trustService}`)}
<body>
  <a class="skip" href="#main">Skip to content</a>
  <div class="wrap">
    <header class="brand">
      <span class="mark"><b>dmj</b>.one</span>
      <span class="svc">${escapeHtml(issuer)}</span>
      <span class="descriptor">${escapeHtml(IDENTITY.descriptor)}</span>
    </header>
    <main id="main">
      <div class="card">
${studs()}
        <p class="eyebrow">Verification</p>
        <h1 class="type-title">Credential not found</h1>

        <div class="verdict ${v.cls}" id="verdict">
          <p class="word"><span class="glyph" aria-hidden="true">${escapeHtml(v.glyph)}</span><span id="verdict-word">${escapeHtml(v.word)}</span></p>
          <p class="sub" id="verdict-sub">${escapeHtml(v.sub)}</p>
        </div>

        <div class="status unknown" role="status">
          <span class="dot" aria-hidden="true"></span>
          <span class="txt"><b>UNKNOWN</b><span>No credential matches this link. Check the ID or the QR code on the certificate.</span></span>
        </div>
        <p class="trust">If you scanned a QR code from a printed certificate and reached this page, the
        credential may have been mistyped or may not exist. ${escapeHtml(issuer)} only attests to credentials it has issued.</p>
      </div>
    </main>
    <footer class="foot">${escapeHtml(IDENTITY.trustService)} · ${escapeHtml(IDENTITY.email)}</footer>
  </div>
</body>
</html>`;
}

/**
 * The public landing page at `/` — a branded entry point so the bare domain is
 * never a raw 404. The form GETs `/?id=…`, which the route redirects to
 * `/c/<id>` (works with JavaScript off; no path-building needed client-side).
 */
export function renderLandingPage(input: { nonce: string; issuer: string }): string {
  const { nonce, issuer } = input;
  return `${head(nonce, `Verify a credential · ${IDENTITY.trustService}`)}
<body>
  <a class="skip" href="#main">Skip to content</a>
  <div class="wrap">
    <header class="brand">
      <span class="mark"><b>dmj</b>.one</span>
      <span class="svc">${escapeHtml(issuer)}</span>
      <span class="descriptor">${escapeHtml(IDENTITY.descriptor)}</span>
    </header>
    <main id="main">
      <section class="card" aria-labelledby="lh">
${studs()}
        <p class="eyebrow">Verification</p>
        <h1 class="type-title" id="lh">Verify a credential</h1>
        <p class="recipient"><span class="lbl">${escapeHtml(IDENTITY.trustService)}</span>Confirm a certificate is authentic, untampered, and recorded in the transparency log.</p>
${flourish()}
        <form class="lookup" method="GET" action="/" role="search" aria-label="Verify by credential ID">
          <input name="id" type="text" inputmode="text" autocomplete="off" spellcheck="false"
                 placeholder="Credential ID, e.g. DMJ-IC-20260606-01" aria-label="Credential ID" maxlength="64" required>
          <button class="btn primary" type="submit">Verify</button>
        </form>
        <p class="trust">Scan the QR code on a certificate, follow its verification link, or paste the credential ID above. ${escapeHtml(issuer)} only attests to credentials it has issued; the handwritten signature lives only inside the password-protected PDF, never on this page.</p>
      </section>
      <section class="explainer" aria-labelledby="he">
        <h2 id="he">How verification works</h2>
        <p>Each credential is bound by a detached post-quantum signature (ML-DSA-87) over a canonical record that includes the document&rsquo;s exact-bytes hash (SHA-256), and is entered in a public, append-only, tamper-evident transparency log whose successive signed heads form a hash chain. Where external anchoring is enabled, each new head may additionally be published to a public GitHub repository (github.com/divyamohan1993/dmjone-trust-anchor), giving a publicly-timestamped, externally-hosted commit record; because the log is an append-only chain of signed heads, any silent rewrite or back-dating is then detectable by anyone who has recorded an earlier head. (Publication is best-effort; this page shows whether the credential&rsquo;s head is published or still pending.) Change a single bit and verification reports <strong>TAMPERED</strong>. This is a self-signed cryptographic attestation by an independent educational initiative, not a licensed certifying-authority signature; the document itself carries no embedded signature.</p>
      </section>
    </main>
    <footer class="foot">
      ${escapeHtml(IDENTITY.trustService)} · ${escapeHtml(IDENTITY.email)} · <span class="motto">${escapeHtml(IDENTITY.motto)}</span>
    </footer>
  </div>
</body>
</html>`;
}

/** Render the full public credential page for a known record. */
export function renderCredentialPage(input: CredentialPageInput): string {
  const { record, issuer, issuerLegalName, nonce } = input;
  // The verdict/ledger/trust/downloads scaffold is kind-agnostic; only the hero
  // copy and the "Credential details" rows branch by kind. `record.id` is the id
  // for every kind (certificate `credentialId` / letter+upload `documentId`), so
  // it drives the page id + downloads without touching the union's id field.
  const kind = documentKind(record);
  const id = record.id;
  const face =
    kind === 'letter'
      ? letterFace(record.content as LetterContent, formatIssueDate((record.content as LetterContent).issueDate), issuer, id)
      : kind === 'upload'
        ? uploadFace(record.content as UploadAttestation, formatIssueDate((record.content as UploadAttestation).issueDate), issuer, id)
        : certificateFace(record.content as CredentialContent, formatIssueDate((record.content as CredentialContent).issueDate), issuer, id);
  const outcome = input.verification.outcome;

  // SSR status from the REAL server-computed verdict — correct and
  // court-presentable with JavaScript off. The client script later re-runs the
  // identical check live for the animated ledger; the result is the same.
  const badge = outcomeBadge(outcome, issuer);
  const ssrStatusClass = badge.cls;
  const ssrStatusLabel = badge.label;
  const ssrStatusNote = badge.note;

  // Tier 1 — the plain-language verdict, server-rendered so the human sentence
  // is correct with JS off. The `sealed` class is added by the client ONLY on a
  // live 'valid' result (gold's scarcity is the trust signal), never here.
  const verdict = verdictCopy(outcome);

  // Pre-render each check row with its server-computed state, so the ledger is
  // meaningful (and honest) before any script runs.
  const checkRows: Array<{ key: keyof VerificationChecks; label: string }> = [
    { key: 'mldsaSignature', label: 'Post-quantum signature (ML-DSA-87)' },
    { key: 'logInclusion', label: 'Transparency-log inclusion' },
    { key: 'anchorProof', label: 'External anchor (public GitHub log)' },
    { key: 'notRevoked', label: 'Not revoked by issuer' },
  ];
  const checksHtml = checkRows
    .map((row) => {
      const cls = checkClass(row.key, input.verification.checks[row.key]);
      // Carry pass/fail to assistive tech (the .ic glyph + colour are aria-hidden).
      const word = cls === 'pass' ? 'Passed' : cls === 'fail' ? 'Failed' : cls === 'warn' ? 'Pending' : 'Checking';
      return `          <li data-check="${row.key}" class="${cls}"><span class="ic" aria-hidden="true"></span><span>${escapeHtml(row.label)}</span><span class="sr-only" data-check-status>${word}</span></li>`;
    })
    .join('\n');

  const section63Path = `/api/credentials/${encodeURIComponent(id)}/section63`;
  const verifyApiPath = `/api/verify/${encodeURIComponent(id)}`;

  return `${head(nonce, face.pageTitle)}
<body data-credential-id="${escapeHtml(id)}" data-verify-url="${escapeHtml(verifyApiPath)}">
  <a class="skip" href="#main">Skip to content</a>
  <div class="wrap">
    <header class="brand">
      <span class="mark"><b>dmj</b>.one</span>
      <span class="svc">${escapeHtml(issuer)}</span>
      <span class="descriptor">${escapeHtml(IDENTITY.descriptor)}</span>
    </header>

    <main id="main">
      <section class="card" aria-labelledby="cred-title">
${studs()}
${face.hero}

        <!-- Tier 1: the plain-language verdict — the hero sentence, server-rendered
             from the authoritative outcome so it is correct without JavaScript.
             The Great Vibes seal (CSS) blooms under it on a live VALID result. -->
        <div class="verdict ${verdict.cls}" id="verdict">
          <p class="word"><span class="glyph" aria-hidden="true">${escapeHtml(verdict.glyph)}</span><span id="verdict-word">${escapeHtml(verdict.word)}</span></p>
          <p class="sub" id="verdict-sub">${escapeHtml(verdict.sub)}</p>
          <p class="seal" aria-hidden="true">Verified</p>
        </div>

        <!-- Tier 2: the cryptographic ledger. The live status badge + per-check
             rows, pre-rendered with the server-computed verdict so they are
             meaningful without JavaScript. The client re-runs the same check
             live and re-paints these rows for the animated sequence. -->
        <div class="status ${ssrStatusClass}" id="status" role="status" aria-live="polite" data-ssr-outcome="${escapeHtml(outcome)}">
          <span class="dot" aria-hidden="true"></span>
          <span class="txt">
            <b id="status-label">${ssrStatusLabel}</b>
            <span id="status-note">${escapeHtml(ssrStatusNote)}</span>
          </span>
        </div>

        <ul class="checks" id="checks" aria-label="Verification checks">
${checksHtml}
        </ul>
      </section>

${flourish()}

      <section class="facts" aria-labelledby="facts-h">
        <h2 id="facts-h">${kind === 'certificate' ? 'Credential details' : 'Document details'}</h2>
        <dl class="grid">
${face.detailRows}
          <dt>Status</dt><dd><span class="pill ${ssrStatusClass}">${ssrStatusLabel}</span></dd>
        </dl>
      </section>

      <section class="trust" aria-label="Trust statement">
        ${trustLead(kind, issuerLegalName)} A detached post-quantum
        cryptographic signature (ML-DSA-87) over the exact record establishes that it was issued by
        dmj.one and is unaltered, and the entry is recorded in a public, append-only, tamper-evident
        transparency log whose successive signed heads may, where external anchoring is enabled,
        additionally be published to a public GitHub repository
        (github.com/divyamohan1993/dmjone-trust-anchor) as an externally-hosted, publicly-timestamped
        commit record (best-effort; this credential&rsquo;s head shows above as published or still
        pending). This is a
        <strong>self-signed cryptographic attestation</strong> by an independent educational initiative;
        it is <strong>not</strong> a licensed certifying-authority Digital Signature Certificate, the
        document carries no embedded signature, and no claim of government accreditation is made.
        A BSA 2023 §63 certificate of authenticity is available below for legal use.
      </section>

      <div class="actions">
        <a class="btn secondary" href="${section63Path}" id="dl-63">Download §63 certificate of authenticity</a>
        <a class="btn" href="#download-panel">Are you the recipient? Get your signed certificate</a>
      </div>

      <!-- Password-gated download. The signed PDF (with the handwritten
           signature) is obtained ONLY here, by POST with the private password.
           There is deliberately no GET link to the certificate anywhere. -->
      <details class="panel" id="download-panel">
        <summary>Download your signed certificate (recipient only)</summary>
        <div class="inner">
          <!-- Fails closed without JS: POSTs form-encoded to /api/download, which
               rejects (400) rather than leaking the password into a GET URL/logs.
               The script below upgrades this to a fetch + in-page download. -->
          <form id="dl-form" method="POST" action="/api/download" autocomplete="off">
            <input type="hidden" name="credentialId" value="${escapeHtml(id)}">
            <label for="dl-pass">Enter your private download password</label>
            <input id="dl-pass" name="password" type="password" autocomplete="current-password"
                   minlength="1" maxlength="128" required aria-describedby="dl-hint dl-msg">
            <div class="actions"><button class="btn primary" type="submit" id="dl-submit">Verify &amp; download PDF</button></div>
            <p class="msg" id="dl-hint">The password was set when the certificate was issued. Anyone holding the
            certificate file can verify it without a password; the password is only needed to <em>obtain</em> the file.</p>
            <p class="msg" id="dl-msg" role="status" aria-live="polite"></p>
          </form>
        </div>
      </details>

      <section class="explainer" aria-labelledby="tamper-h">
        <h2 id="tamper-h">How tamper detection works</h2>
        <p>The certificate's exact bytes are hashed and that hash is covered by a post-quantum signature.
        Change a single bit anywhere in the file and the hash no longer matches, so verification reports
        <strong>TAMPERED</strong>. Change any field and the signature itself fails. Try it: upload a real or
        altered copy on the verification API and watch the result flip.</p>
        <p class="flip" aria-hidden="true">
          <span class="bit">0</span><span class="bit">1</span><span class="bit changed">0</span><span class="bit">1</span>
          <span>&nbsp;one flipped bit &rarr; TAMPERED</span>
        </p>
      </section>
    </main>

    <footer class="foot">
      Verified at <a href="${escapeHtml(input.verifyBaseUrl)}">${escapeHtml(input.verifyBaseUrl)}</a> ·
      ${escapeHtml(IDENTITY.trustService)} · ${escapeHtml(IDENTITY.email)} ·
      <span class="motto">${escapeHtml(IDENTITY.motto)}</span>
    </footer>
  </div>

  <script nonce="${nonce}">
  (function(){
    "use strict";
    var body = document.body;
    var verifyUrl = body.getAttribute("data-verify-url");
    var statusEl = document.getElementById("status");
    var labelEl = document.getElementById("status-label");
    var noteEl = document.getElementById("status-note");
    var checksEl = document.getElementById("checks");
    var verdictEl = document.getElementById("verdict");
    var verdictWordEl = document.getElementById("verdict-word");
    var verdictSubEl = document.getElementById("verdict-sub");
    if(!verifyUrl || !statusEl) return;

    // Tier 2 (badge) copy, plus Tier 1 (plain-language verdict) copy, mirrored
    // from the server so the live re-paint updates BOTH tiers from one result.
    var COPY = {
      valid:    { cls:"valid",    label:"VALID",    note:"This credential is authentic, untampered, and recorded in the transparency log.",
                  word:"Genuine.", sub:"Issued by dmj.one Trust Services, and unaltered since." },
      revoked:  { cls:"revoked",  label:"REVOKED",  note:"This credential was issued by us but has since been revoked. It should not be relied upon.",
                  word:"Genuine, but revoked.", sub:"Issued by us, but withdrawn. Do not rely on it." },
      tampered: { cls:"bad",      label:"TAMPERED", note:"The verified data does not match what was signed.",
                  word:"Altered. Do not rely on this.", sub:"The data shown does not match what was signed." },
      unknown:  { cls:"unknown",  label:"UNKNOWN",  note:"We could not confirm this credential. Check the ID, or contact the issuer.",
                  word:"Not confirmed.", sub:"We could not confirm this credential. Check the ID or contact the issuer." }
    };

    function setStatus(kind){
      var c = COPY[kind] || COPY.unknown;
      // Tier 2: the cryptographic badge.
      statusEl.className = "status " + c.cls;
      if(labelEl) labelEl.textContent = c.label;
      if(noteEl) noteEl.textContent = c.note;
      // Tier 1: the plain-language verdict. The SEAL blooms only on VALID — the
      // gold flourish is withheld on revoked/tampered/unknown by design.
      if(verdictEl){
        verdictEl.className = "verdict " + c.cls + (kind === "valid" ? " sealed" : "");
      }
      if(verdictWordEl) verdictWordEl.textContent = c.word;
      if(verdictSubEl) verdictSubEl.textContent = c.sub;
    }

    function paintChecks(checks){
      if(!checksEl) return;
      checksEl.hidden = false;
      var items = checksEl.querySelectorAll("li[data-check]");
      for(var i=0;i<items.length;i++){
        var li = items[i];
        var key = li.getAttribute("data-check");
        var v = checks ? checks[key] : undefined;
        li.classList.remove("run","pass","warn","fail");
        var word = "Checking";
        if(key === "anchorProof" && v === false){ li.classList.add("warn"); word = "Pending"; }
        else if(v === true){ li.classList.add("pass"); word = "Passed"; }
        else if(v === false){ li.classList.add("fail"); word = "Failed"; }
        var sr = li.querySelector("[data-check-status]");
        if(sr){ sr.textContent = word; }
      }
    }

    // Live "quantum-verifying" sequence, then SETTLE the authoritative result.
    statusEl.className = "status checking";
    if(labelEl) labelEl.textContent = "Verifying";
    if(noteEl) noteEl.textContent = "Running post-quantum signature and transparency-log checks\\u2026";
    if(checksEl){
      checksEl.hidden = false;
      var running = checksEl.querySelectorAll("li[data-check]");
      for(var j=0;j<running.length;j++){ running[j].classList.add("run"); }
    }

    var started = Date.now();
    fetch(verifyUrl, { headers:{ "accept":"application/json" } })
      .then(function(r){ return r.ok ? r.json() : Promise.reject(new Error("verify failed")); })
      .then(function(result){
        var wait = Math.max(0, 650 - (Date.now() - started)); // let the animation breathe
        setTimeout(function(){
          paintChecks(result.checks);
          setStatus(result.outcome);
        }, wait);
      })
      .catch(function(){
        // Network/verify error: fall back to the server-rendered verdict (already correct).
        setStatus(statusEl.getAttribute("data-ssr-outcome") || "unknown");
      });

    // Password-gated download (progressive enhancement of the form POST).
    var form = document.getElementById("dl-form");
    var msg = document.getElementById("dl-msg");
    var pass = document.getElementById("dl-pass");
    var submit = document.getElementById("dl-submit");
    if(form){
      form.addEventListener("submit", function(ev){
        ev.preventDefault();
        if(!pass || !pass.value){ return; }
        if(msg){ msg.className = "msg"; msg.textContent = "Verifying\\u2026"; }
        if(submit){ submit.disabled = true; }
        fetch("/api/download", {
          method:"POST",
          headers:{ "content-type":"application/json", "accept":"application/json" },
          body: JSON.stringify({ credentialId: body.getAttribute("data-credential-id"), password: pass.value })
        }).then(function(res){
          if(res.status === 200){
            return res.blob().then(function(blob){
              var url = URL.createObjectURL(blob);
              var a = document.createElement("a");
              a.href = url; a.download = (body.getAttribute("data-credential-id")||"certificate") + ".pdf";
              document.body.appendChild(a); a.click(); a.remove();
              setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
              if(msg){ msg.className = "msg ok"; msg.textContent = "Download started."; }
              if(pass){ pass.value = ""; }
            });
          }
          if(res.status === 429){
            var ra = res.headers.get("retry-after");
            if(msg){ msg.className = "msg err"; msg.textContent = "Too many attempts. Please wait" + (ra ? " " + ra + "s" : "") + " and try again."; }
            return;
          }
          if(msg){ msg.className = "msg err"; msg.textContent = "Verification failed. Check your details and try again."; }
        }).catch(function(){
          if(msg){ msg.className = "msg err"; msg.textContent = "Something went wrong. Please try again."; }
        }).then(function(){
          if(submit){ submit.disabled = false; }
        });
      });
    }
  })();
  </script>
</body>
</html>`;
}
