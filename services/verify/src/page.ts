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

/**
 * Turn a raw upload filename into a dignified document title for the hero: drop a
 * trailing extension, collapse separator runs (`.` `_` `-`) into single spaces,
 * squeeze whitespace. Original case is preserved on purpose — title-casing would
 * mangle intentional capitalisation ("iPhone", "NDA"); the document is shown as
 * the uploader named it. The extension is surfaced separately as a small chip.
 */
function displayDocName(filename: string): string {
  const noExt = filename.replace(/\.[A-Za-z0-9]{1,8}$/, '');
  const spaced = noExt.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return spaced || 'Uploaded document';
}

/** A trailing file extension as a short uppercase tag (e.g. "PDF"), or '' if none. */
function fileExtTag(filename: string): string {
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(filename)?.[1];
  return ext ? ext.toUpperCase() : '';
}

/**
 * Show a hash as a short, masked fingerprint (head + tail), never 64 raw hex
 * chars. The server compares the FULL hash against its stored record, so the
 * on-screen value is human reassurance only, never the thing being checked.
 */
function maskHash(hex: string): string {
  return hex.length > 20 ? `${hex.slice(0, 10)}…${hex.slice(-6)}` : hex;
}

export interface CredentialPageInput {
  record: CredentialRecord;
  issuer: string;
  issuerLegalName: string;
  verifyBaseUrl: string;
  nonce: string;
  /** Server-computed verdict, so the no-JS badge is a real cryptographic result. */
  verification: { outcome: VerificationOutcome; checks: VerificationChecks };
  /**
   * Server-verified RFC-3161 trusted timestamp over the record's raw ML-DSA
   * signature bytes, if the record carries a token AND it verifies. Computed in
   * the route handler (the page is a pure renderer with no `deps`). Present ⇒ one
   * honest, CONDITIONAL line is surfaced ("Independently timestamped by … at …
   * (RFC-3161)"); absent/unverified ⇒ nothing is claimed. Never implies a legal
   * guarantee — it is independently-verifiable forensic evidence of WHEN the
   * signature existed, not a statutory presumption.
   */
  trustedTimestamp?: { genTime?: string; tsaSubject?: string };
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
 * The struck gold SEAL — the cinematic focal jewel of the "Engraved Instrument"
 * hero. An embossed medallion (metal sheen + deboss via CSS gradients/shadows in
 * VERIFY_CSS) with the script word "Verified" engraved in its core and a curved
 * notary legend ring set in real type around the rim (SVG textPath, same-origin
 * fragment refs — CSP-clean). It is purely decorative (`aria-hidden`): the human
 * verdict is carried by the `.verdict .word` sentence, so screen readers and the
 * no-JS path never depend on it. Visibility + the stamp animation are gated by
 * the `.verdict.valid.sealed` class — added by the client ONLY on a live VALID
 * result / a confirmed file match — so the gold is NEVER shown on a revoked,
 * tampered, unknown, or merely-record-valid upload state (the scarcity of the
 * seal is the trust signal). Under prefers-reduced-motion it is present + final.
 */
function seal(): string {
  return `          <div class="seal" aria-hidden="true">
            <span class="seal__flash"></span>
            <svg class="seal__ring" viewBox="0 0 100 100" focusable="false">
              <defs>
                <path id="seal-ring-top" d="M 50 50 m -39 0 a 39 39 0 1 1 78 0"></path>
                <path id="seal-ring-bot" d="M 50 50 m 39 0 a 39 39 0 1 1 -78 0"></path>
              </defs>
              <text><textPath href="#seal-ring-top" startOffset="50%" text-anchor="middle">dmj.one Trust Services</textPath></text>
              <text><textPath href="#seal-ring-bot" startOffset="50%" text-anchor="middle">&#183; Verified Record &#183;</textPath></text>
            </svg>
            <span class="seal__core">
              <span class="seal__star">&#10022;</span>
              <span class="seal__script">Verified</span>
            </span>
          </div>`;
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
      // LEAD WITH THE WARNING (the word is the withdrawal itself, not a reassuring
      // prefix): the eye must land on the withdrawal, not on prestige. The glyph
      // (⊘) + word + the demoted identity read as "do not rely" at a glance,
      // without depending on colour alone.
      return {
        cls: 'revoked',
        word: 'Revoked.',
        sub: 'Issued by dmj.one, then withdrawn. Do not rely on it.',
        glyph: '⊘', // circled slash: withdrawn / no longer valid
      };
    case 'tampered':
      return {
        cls: 'bad',
        word: 'Altered.',
        sub: 'This does not match what was signed. Do not rely on it.',
        glyph: '✕', // cross: does not match
      };
    default:
      return {
        cls: 'unknown',
        word: 'Not confirmed.',
        sub: "We couldn't confirm this. Check the ID or contact the issuer.",
        glyph: '—', // em dash: neutral, not an alarm (no green/red)
      };
  }
}

/** Map an outcome to its badge presentation (class + label + note). */
function outcomeBadge(
  outcome: VerificationOutcome,
  issuer: string,
): { cls: string; label: string; note: string } {
  switch (outcome) {
    // The LABEL is the lifecycle term the pill + checks ledger share (asserted by
    // app.test.ts: >VALID<, >UNKNOWN<, class="pill valid"); leave it. The NOTE
    // states the TECHNICAL fact and must NOT restate the human verdict word
    // ("Genuine."/"Revoked.") — it informs, it does not echo (fix #4).
    case 'valid':
      return {
        cls: 'valid',
        label: 'VALID',
        note: `The post-quantum signature by ${issuer} verifies against this record, which is in the transparency log and not revoked.`,
      };
    case 'revoked':
      return {
        cls: 'revoked',
        label: 'REVOKED',
        note: `Issued by ${issuer}, then withdrawn by the issuer. It should not be relied upon.`,
      };
    case 'tampered':
      return {
        cls: 'bad',
        label: 'TAMPERED',
        note: 'The data shown does not match what was cryptographically signed.',
      };
    default:
      return {
        cls: 'unknown',
        label: 'UNKNOWN',
        note: `We could not confirm this against ${issuer}'s records. Check the ID, or contact the issuer.`,
      };
  }
}

/**
 * (#5) HERO HARD-FACT — valid only. The hero is otherwise pure assertion (word +
 * seal); this is the ONE compact line of EVIDENCE a non-scroller sees. It names
 * exactly the cryptographic guarantees a `valid` outcome PROVES: deriveOutcome
 * returns 'valid' only when mldsaSignature && logInclusion && notRevoked (and the
 * record-level hashMatch) all hold — anchorProof is informational and may be
 * "pending", so we deliberately do NOT claim "all N checks passed" (that would be
 * false the moment the anchor is pending, contradicting the ledger below). When a
 * verified RFC-3161 timestamp is present we append the independent WHEN, dated to
 * the day (the full token detail lives in the conditional trust line below).
 * Returns '' on every non-valid state, so a bad/unconfirmed hero never asserts it.
 */
function heroHardFact(affirmative: boolean, ts: CredentialPageInput['trustedTimestamp']): string {
  if (!affirmative) return '';
  const day = (ts?.genTime ?? '').slice(0, 10);
  const stamped = /^\d{4}-\d{2}-\d{2}$/.test(day) ? ` · independently timestamped ${escapeHtml(formatIssueDate(day))}` : '';
  return `          <p class="hardfact" aria-label="What this proves">Post-quantum signature verified, recorded in the transparency log, not revoked${stamped}.</p>`;
}

/**
 * (#2) CERTIFICATE/LETTER COMPARISON line — the cert analogue of the upload
 * file-gate. A copied QR on a forged certificate still loads THIS page and shows
 * the TRUE record; the big "Genuine." discourages scrutiny. So for a VALID
 * certificate/letter we ask the reader to compare the human-readable facts below
 * against the document in their hand. NOT shown on uploads (they have the
 * byte-level file-gate already) and NOT on bad states.
 */
function heroCompareLine(affirmative: boolean, kind: ReturnType<typeof documentKind>): string {
  if (!affirmative || kind === 'upload') return '';
  return `          <p class="compare">Confirm the name, date and details below match the document you&rsquo;re holding.</p>`;
}

/**
 * (#3) HONESTY line — surfaced BY THE VERDICT in every state (compact). The full
 * trust statement is below the fold; this lifts the one disclaimer that must not
 * be buried under confident seal/badge language: dmj.one is an independent
 * educational initiative, not a government-licensed certifying authority. No em
 * dash (house style); kept to a single small line.
 */
function heroHonestyLine(): string {
  return `          <p class="honesty">A cryptographic attestation by dmj.one, an independent educational initiative, not a government-licensed certifying authority.</p>`;
}

/**
 * Upload (Mode 3) FILE-GATE copy. An uploaded document shows NO human-comparable
 * content on the public page (only a filename + a hash), so an id/QR scan ALONE
 * cannot prove the file in the holder's hand is the one we attested: a copied QR
 * or document number can be placed on any file. For a cryptographically-valid
 * upload we therefore lead with a cautious, record-scoped state and require the
 * file itself to be confirmed (client posts it to /api/verify/file); the
 * affirmative green verdict + seal are earned ONLY on a byte-for-byte match.
 * Certificates/letters show authoritative content the verifier can compare, so
 * they keep their id/QR verdict and never reach this gate.
 */
const UPLOAD_FILEGATE_VERDICT = {
  cls: 'unconfirmed',
  word: 'Confirm your copy.',
  sub: 'This document number carries a genuine dmj.one attestation. Scanning a code only proves the record exists, not which file you are holding. Check your file below; only a byte-for-byte match proves it is the document we attested.',
  glyph: '?',
};

const UPLOAD_FILEGATE_BADGE = {
  cls: 'unconfirmed',
  label: 'FILE NOT YET CONFIRMED',
  note: 'The attestation record is genuine and intact. Confirm the file itself to prove your copy is the one we attested.',
};

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
  const docName = displayDocName(filename);
  const ext = fileExtTag(filename);
  return {
    pageTitle: `Attested document · ${filename} · ${IDENTITY.trustService}`,
    hero: `        <p class="eyebrow">Attested Document</p>
        <h1 class="type-title doc-name" id="cred-title">${escapeHtml(docName)}</h1>
        <p class="docmeta">${ext ? `<span class="filechip">${escapeHtml(ext)}</span>` : ''}<span class="docnum"><span class="k">Document no.</span> <code class="mono">${escapeHtml(id)}</code></span></p>`,
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
 * by the per-request nonce. The CSS is the shared @dmjone/brand sheet (so the web
 * surface never drifts from the printed certificate) followed by {@link verifyCss}
 * — the verify-only "Engraved Instrument" reskin + hero/proof layout. Both load
 * inside the single nonce'd <style>; the fonts they reference are served
 * same-origin from the in-memory /fonts/:file route (font-src 'self'). Comments
 * are stripped from both to keep the inline sheet lean.
 */
function head(nonce: string, title: string): string {
  const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
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
${stripComments(designSystemCss())}
${stripComments(verifyCss())}
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
 * The public landing page at `/` — the portal's front door, in the same
 * cinematic "Engraved Instrument" language as the credential pages. The hero
 * asks the visitor's literal question ("Is it genuine?"); the credential page
 * answers it ("Genuine."). ONE action above the fold: the engraved lookup
 * plate. No seal here — gold "Verified" iconography is never shown before
 * anything is verified. The form GETs `/?id=…`, which the route normalises
 * (trim + uppercase) and redirects to `/c/<id>` — works with JavaScript off.
 * The method + the locked technical paragraph disclose below the fold.
 */
export function renderLandingPage(input: { nonce: string; issuer: string }): string {
  const { nonce, issuer } = input;
  // Same masthead derivation as the credential hero: the wordmark already says
  // dmj.one, so the service line drops the duplicated prefix ("Trust Services").
  const issuerTagline = issuer.replace(/^dmj\.one\s+/i, '').trim() || issuer;
  return `${head(nonce, `Verify a credential · ${IDENTITY.trustService}`)}
<body>
  <a class="skip" href="#main">Skip to content</a>
  <main id="main" class="wrap verify">
    <section class="hero hero--landing" aria-labelledby="lh">
      <span class="hero__frame" aria-hidden="true"></span>

      <header class="brand trustmark">
        <span class="mark"><b>dmj</b>.one</span>
        <span class="svc">${escapeHtml(issuerTagline)}</span>
      </header>

      <div class="hero__core">
        <p class="eyebrow">Public verification</p>
        <h1 class="type-title" id="lh">Is it genuine?</h1>
        <p class="lead">Every credential ${escapeHtml(IDENTITY.name)} issues answers that question here, cryptographically, in seconds.</p>

        <form class="lookup-plate" method="GET" action="/" role="search" aria-label="Verify by credential ID">
          <label class="lp-label" for="cred-id">Credential ID</label>
          <div class="lp-row">
            <input id="cred-id" name="id" type="text" inputmode="text" autocomplete="off"
                   autocapitalize="characters" spellcheck="false" enterkeyhint="go"
                   placeholder="DMJ-IC-20260606-01" aria-describedby="lp-hint" maxlength="64" required>
            <button class="btn primary lp-go" type="submit">Verify</button>
          </div>
          <p class="lp-hint" id="lp-hint">Printed beside the QR code on the document. Scanning the QR brings you here automatically.</p>
        </form>

        <p class="honesty">A cryptographic attestation by ${escapeHtml(IDENTITY.name)}, an independent educational initiative, not a government-licensed certifying authority.</p>
      </div>

      <a class="scrollcue" href="#how">
        <span>How it works</span>
        <span class="chev" aria-hidden="true"></span>
      </a>
    </section>

    <section class="proof how" id="how" aria-labelledby="how-h">
      <div class="proof__intro">
        <p class="ek">The method</p>
        <h2 id="how-h">What verification checks</h2>
      </div>

      <ol class="method">
        <li>
          <span class="num" aria-hidden="true">01</span>
          <div>
            <h3>A post-quantum signature</h3>
            <p>Every credential is signed with ML-DSA-87 (FIPS&nbsp;204), a detached post-quantum signature over a canonical record of the credential&rsquo;s contents.</p>
          </div>
        </li>
        <li>
          <span class="num" aria-hidden="true">02</span>
          <div>
            <h3>The document&rsquo;s exact bytes</h3>
            <p>The record binds the document&rsquo;s SHA-256 fingerprint. Change a single bit of the file and verification reports <strong>TAMPERED</strong>.</p>
          </div>
        </li>
        <li>
          <span class="num" aria-hidden="true">03</span>
          <div>
            <h3>A public transparency log</h3>
            <p>Issuance is entered in an append-only, tamper-evident log whose successive signed heads form a hash chain, so silently rewriting history is detectable.</p>
          </div>
        </li>
        <li>
          <span class="num" aria-hidden="true">04</span>
          <div>
            <h3>Revocation, checked live</h3>
            <p>A credential the issuer has withdrawn answers <strong>Revoked</strong>, plainly, at the top.</p>
          </div>
        </li>
      </ol>

      <div class="ways">
        <h3 class="block-h">Three ways to verify</h3>
        <ul>
          <li><b>Scan</b> the QR code printed on the document.</li>
          <li><b>Follow</b> the verification link beside it.</li>
          <li><b>Paste</b> the credential ID into the field above.</li>
        </ul>
      </div>

      <section class="explainer" aria-labelledby="he">
        <h2 id="he">In technical terms</h2>
        <p>Each credential is bound by a detached post-quantum signature (ML-DSA-87) over a canonical record that includes the document&rsquo;s exact-bytes hash (SHA-256), and is entered in a public, append-only, tamper-evident transparency log whose successive signed heads form a hash chain. Where external anchoring is enabled, each new head may additionally be published to a public GitHub repository (github.com/divyamohan1993/dmjone-trust-anchor), giving a publicly-timestamped, externally-hosted commit record; because the log is an append-only chain of signed heads, any silent rewrite or back-dating is then detectable by anyone who has recorded an earlier head. (Publication is best-effort; this page shows whether the credential&rsquo;s head is published or still pending.) Change a single bit and verification reports <strong>TAMPERED</strong>. This is a self-signed cryptographic attestation by an independent educational initiative, not a licensed certifying-authority signature; the document itself carries no embedded signature.</p>
      </section>
    </section>

    <footer class="foot">
      ${escapeHtml(IDENTITY.trustService)} · ${escapeHtml(IDENTITY.email)} · <span class="motto">${escapeHtml(IDENTITY.motto)}</span>
    </footer>
  </main>
</body>
</html>`;
}

/**
 * The honest, CONDITIONAL trusted-timestamp line. Rendered ONLY when the route
 * handler verified an RFC-3161 token over this record's raw ML-DSA signature
 * bytes (server-side, no JS). It states WHEN the signature provably existed — an
 * independent third-party attestation — and never implies a legal guarantee. The
 * subject + time come from the TSA cert/token, so both are HTML-escaped. Returns
 * '' (renders nothing) when no verified timestamp is present, so a record without
 * a token — or with one that failed to verify — makes no claim at all.
 */
function timestampLine(ts: CredentialPageInput['trustedTimestamp']): string {
  if (!ts) return '';
  const subject = (ts.tsaSubject ?? '').trim();
  const when = (ts.genTime ?? '').trim();
  const by = subject ? ` by ${escapeHtml(subject)}` : '';
  const at = when ? ` at ${escapeHtml(when)}` : '';
  return `
      <p class="trust trust-ts" aria-label="Trusted timestamp">Independently timestamped${by}${at}
      (RFC&#8209;3161): a third party attested WHEN this signature existed, so it could not have been
      back-dated. This is independently-verifiable forensic evidence, not a legal guarantee.</p>`;
}

/**
 * Verify-only style addendum — the "Engraved Instrument" reskin + hero/proof
 * layout. Appended INSIDE the verify page's nonce'd `<style>` AFTER the shared
 * {@link designSystemCss}, so it overrides only on this surface; the issuer admin
 * (which consumes the same shared sheet) is untouched. Every rule is class-scoped
 * to verify-specific selectors (`.hero`, `.proof`, the seal, and the verify-only
 * `.verdict/.status/.checks/.facts/.flourish` which the admin does not render),
 * and it holds ZERO `style=""`/`on*=`/external origins so it drops in under the
 * strict nonce CSP unchanged. String.raw mirrors designSystemCss (no backtick or
 * ${ in the body; the CSS unicode escapes in pseudo-content need the literal
 * backslash). The single source of these rules is here, alongside the markup.
 */
function verifyCss(): string {
  return String.raw`/* ========================================================================
   dmj.one verify — "Engraved Instrument" reskin (verify surface ONLY).
   Loaded after the shared sheet; overrides the verify-only verdict surface and
   adds the minimal cinematic hero + the progressive-disclosure proof below.
   ======================================================================== */

/* ---- ONE gold accent: replace the shared multicolour watercolour wash with a
   single whisper-faint warm bloom (verify only; the issuer keeps the wash). --- */
body{
  background-image:
    radial-gradient(42% 30% at 50% 28%, rgba(176,137,47,.06), transparent 70%),
    radial-gradient(80% 60% at 50% 122%, rgba(203,168,94,.05), transparent 70%);
  background-attachment:fixed;
}
html{scroll-behavior:smooth;background:var(--paper);
  /* FLUID ROOT (verify page only): 1rem auto-scales with screen width, so the
     rem-sized hero type adjusts to any device without breakpoints — ~13px on a
     small phone up to 18px on a wide desktop, near the 16px default in between. */
  font-size:clamp(13px,calc(10.5px + 0.78vw),18px)}
/* the verify page lays out its OWN full-bleed hero + centred proof column, so the
   shared .wrap max-width/padding must not box the hero. */
.wrap.verify{max-width:none;margin:0;padding:0;overflow-x:clip}

/* ---- ABOVE THE FOLD: the minimal cinematic hero (~100svh) ---------------- */
.hero{position:relative;min-height:100svh;display:grid;grid-template-rows:auto 1fr auto;
  padding:clamp(14px,2.8svh,30px) clamp(20px,5vw,48px) clamp(12px,2svh,22px);text-align:center;isolation:isolate}
/* the frame reduced to a WHISPER: a single hairline rectangle + four faint gold
   corner-diamond ticks (the heavy double-frame + studs, dialled to silence). */
.hero__frame{position:absolute;inset:clamp(12px,2.2vh,22px);border:1px solid rgba(176,137,47,.28);
  border-radius:3px;pointer-events:none;z-index:-1}
.hero__frame::before,.hero__frame::after{content:"";position:absolute;width:7px;height:7px;
  background:var(--gold-soft);transform:rotate(45deg);opacity:.85}
.hero__frame::before{top:-4px;left:-4px;box-shadow:calc(100% + 8px) 0 0 var(--gold-soft)}
.hero__frame::after{bottom:-4px;left:-4px;box-shadow:calc(100% + 8px) 0 0 var(--gold-soft)}

/* (1) trust mark — the institution, small + calm at the crown. Reuses the shared
   .brand mark/svc tokens but centres them and drops the masthead border/descriptor. */
.hero .trustmark{display:flex;align-items:baseline;justify-content:center;gap:.6ch;flex-wrap:wrap;
  border:0;padding:0;animation:v-fade-down 700ms 120ms both ease-out}
.hero .trustmark .mark{font-family:var(--display);font-size:clamp(18px,2.4vw,22px);letter-spacing:.01em;color:var(--ink)}
.hero .trustmark .mark b{color:var(--gold-deep);font-weight:700}
.hero .trustmark .svc{font-family:var(--label);font-size:clamp(10px,1.4vw,12px);letter-spacing:.22em;
  text-transform:uppercase;color:var(--gold-deep)}

/* the centre stack: identity → verdict + seal, balanced in the open middle row. */
.hero__core{align-self:center;display:flex;flex-direction:column;align-items:center;
  gap:clamp(10px,1.8svh,22px);padding:clamp(4px,1.1svh,12px) 0}

/* (2) document identity — reskin the EXISTING .eyebrow/.type-title/.recipient so
   they read as the calm credential line (the JS/tests keep those class names). */
.hero .eyebrow{font-size:clamp(10px,.74rem,13.5px);letter-spacing:.34em}
/* AUTO-FIT title: rem scales with the fluid root; the 9.2vw cap guarantees even the
   longest single-word title (PARTICIPATION) fits the WIDTH on any phone; the svh cap
   bounds its HEIGHT; overflow-wrap + a 2-line clamp catch an overly long custom title. */
.hero .type-title{font-size:clamp(19px,2.2rem,44px);letter-spacing:.04em;margin:.1em 0 0;line-height:1.08;
  /* sized in REM ONLY (scales with the fluid root) so it is STABLE — a vw-based
     size feedback-loops when a long title overflows (overflow widens the viewport
     -> vw grows -> title grows). rem stays put, so the longest title fits. */
  max-width:100%;overflow-wrap:break-word;display:-webkit-box;-webkit-box-orient:vertical;
  -webkit-line-clamp:2;line-clamp:2;overflow:hidden}
.hero .type-title.doc-name{font-size:clamp(17px,1.7rem,30px);letter-spacing:.01em;line-height:1.16;
  /* keep the hero MINIMAL for any filename length: clamp the display name to 3
     lines with an ellipsis. The FULL filename is always shown in the details grid
     below + the page title, so nothing is lost — just progressively disclosed.
     overflow-wrap:anywhere also breaks a pathological no-space token. */
  max-width:min(94vw,32ch);overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;
  -webkit-line-clamp:3;line-clamp:3;overflow:hidden}
/* the recipient line keeps its SHARED markup (a .lbl intro span + the name as the
   inline text node after it — test-pinned for letter/upload). Style the name big
   via the block, and demote the .lbl to the small italic "awarded to" prefix. */
.hero .recipient{margin-top:.7em;font-family:var(--label);font-style:normal;
  font-size:clamp(15px,1.3rem,21px);letter-spacing:.05em;color:var(--ink)}
.hero .recipient .lbl{display:block;font-family:var(--serif);font-style:italic;font-weight:400;
  font-size:clamp(13px,1rem,16px);letter-spacing:0;color:var(--ink-soft);margin-bottom:.18em}
/* the upload hero's docmeta (file chip + number) stays, just centred + hushed. */
.hero .docmeta{justify-content:center;margin-top:1em}

/* (3) THE VERDICT + THE SEAL — the cinematic moment. Reskin the shared .verdict. */
.hero .verdict{margin-top:0;display:flex;flex-direction:column;align-items:center;gap:clamp(8px,1.5svh,16px)}
/* SNAPPIER entrance (#7): the verdict lands almost immediately so a "just tell me"
   reader is not left waiting ~1s. The seal still stamps on its own beat (valid). */
.hero .verdict .word{justify-content:center;font-size:clamp(21px,1.95rem,38px);
  letter-spacing:.02em;gap:.42ch;animation:v-fade-up 520ms 120ms both ease-out}
.hero .verdict .sub{max-width:38ch;margin-top:.5em;font-size:clamp(13px,1rem,16px);
  animation:v-fade-up 520ms 240ms both ease-out}

/* (1+6+7) THE HERO GLYPH fills the medallion slot on BAD states — so a "do not
   rely" verdict is never a few red words floating in a void, and is legible
   WITHOUT colour (a clear mark: ✕ altered, ⊘ revoked, — unknown). On a VALID
   verdict the struck gold seal carries the signal, so the glyph is hidden there.
   Scoped to revoked/.bad/.unknown ONLY — NOT :not(.valid) — so the upload
   file-gate (.unconfirmed, glyph "?") is untouched and keeps its own treatment. */
.hero .verdict .glyph{display:none}
.hero .verdict.revoked .glyph,
.hero .verdict.bad .glyph,
.hero .verdict.unknown .glyph{order:-1;display:grid;place-items:center;
  width:clamp(58px,min(22vw,15svh),140px);height:clamp(58px,min(22vw,15svh),140px);
  border-radius:50%;border:2px solid currentColor;
  font-size:clamp(30px,min(11vw,8svh),76px);line-height:1;font-family:var(--label);
  animation:v-fade-up 520ms 60ms both ease-out}
/* alarm colour: tampered/revoked use the strong --bad; unknown stays neutral ink
   (a mistyped id is not a forgery). Colour reinforces, the GLYPH+WORD carry it. */
.hero .verdict.bad .glyph,.hero .verdict.revoked .glyph{color:var(--bad);
  background:radial-gradient(circle at 50% 42%,var(--bad-soft),transparent 72%)}
.hero .verdict.unknown .glyph{color:var(--ink-soft);
  background:radial-gradient(circle at 50% 42%,#F1EEEA,transparent 72%)}

/* the seal sits ABOVE the verdict word in the hero (DOM order keeps the word
   first for the a11y tree; flex-order lifts the jewel visually). */
.hero .verdict .seal{order:-1}
/* the seal's reserved box is kept ONLY where the gold can be earned (a valid
   verdict). On revoked/tampered/unknown it is removed entirely — no empty void,
   no gold. The upload file-gate starts non-valid and reveals it on a file match
   (the client flips .verdict to "valid sealed", so :not(.valid) stops matching). */
.hero .verdict:not(.valid) .seal{display:none}

/* (1) DEMOTE the credential identity on a bad state, so a forgery is never dressed
   up in full prestige. :has() reads the verdict's LIVE class (the client may flip
   it), so the demotion stays in sync without extra JS. The identity is dimmed +
   de-weighted; the warning glyph/word above become the focal point. */
.hero__core:has(.verdict.revoked) .identity,
.hero__core:has(.verdict.bad) .identity,
.hero__core:has(.verdict.unknown) .identity{opacity:.5;filter:grayscale(.4)}
.hero__core:has(.verdict.revoked) .type-title,
.hero__core:has(.verdict.bad) .type-title,
.hero__core:has(.verdict.unknown) .type-title{text-decoration:line-through;
  text-decoration-color:rgba(154,43,43,.45);text-decoration-thickness:2px}
/* unknown is neutral (mistyped id, not a forgery): dim, but no strike-through. */
.hero__core:has(.verdict.unknown) .type-title{text-decoration:none}
/* UPLOAD file-gate exception: a file MISMATCH flips the verdict to .bad, but the
   RECORD is genuine — the wrong thing is the holder's FILE, not the attested
   document. Defacing the attested doc-name (strike-through/dim) would falsely
   read as "this document is fake". So on a file-gate page the identity is NEVER
   demoted; the ✕ glyph + word + the file-check row below carry the alarm. These
   selectors are deliberately MORE specific than the .bad demotion above (extra
   attr + :has arg) so they win without !important. (File-gate verdict only ever
   becomes .bad on mismatch — never .revoked/.unknown — so .bad is all we reset.) */
body[data-filegate="1"] .hero__core:has(.verdict.bad) .identity{opacity:1;filter:none}
body[data-filegate="1"] .hero__core:has(.verdict.bad) .type-title{text-decoration:none}

/* (#5/#2/#3) the verdict-supporting hero lines — compact single lines that ADD
   evidence (hardfact), prompt comparison (compare) and surface the honesty
   disclaimer, without pushing the hero past ~100svh. */
.hero .verdict .hardfact{margin-top:.45em;max-width:42ch;font-family:var(--label);
  font-size:clamp(11px,.8rem,13px);letter-spacing:.04em;color:var(--gold-deep);
  animation:v-fade-up 520ms 320ms both ease-out}
.hero .verdict .compare{margin-top:.5em;max-width:40ch;font-family:var(--serif);
  font-style:italic;font-size:clamp(12px,.92rem,15px);color:var(--ink);
  animation:v-fade-up 520ms 380ms both ease-out}
.hero .verdict .honesty{margin-top:.55em;max-width:46ch;font-family:var(--serif);
  font-size:clamp(10.5px,.78rem,12.5px);line-height:1.4;color:var(--ink-soft);
  animation:v-fade-in 520ms 460ms both ease-out}

/* ---- The embossed gold seal: a struck medallion, not a sticker -----------
   Scoped to .verdict .seal to OVERRIDE the shared sheet's old tiny-flourish .seal
   (height:0/overflow:hidden) and .verdict.valid.sealed .seal (height:44px) at
   matching-or-higher specificity — otherwise the medallion collapses to the
   legacy 44px strip. The square aspect comes from width==height==var(--d); we
   reset the inherited overflow so the legend ring is not clipped. */
.verdict .seal{--d:clamp(64px,min(26vw,18svh),188px);position:relative;
  width:var(--d);height:var(--d);min-height:var(--d);flex:0 0 auto;overflow:visible;
  border-radius:50%;display:grid;place-items:center;
  /* the metal: warm gold disc with a soft directional sheen (light top-left) */
  background:
    radial-gradient(60% 60% at 36% 30%, #F6E6B8 0%, transparent 58%),
    radial-gradient(120% 120% at 70% 80%, #6E520F 0%, transparent 60%),
    conic-gradient(from 210deg, #C9A24B, #8A6A1C 22%, #E7C977 40%, #9B7822 58%, #D8B45E 74%, #876616 88%, #C9A24B);
  /* the deboss: raised rim catching light up-left, recessed core, gentle drop */
  box-shadow:
    inset 0 2px 3px rgba(255,247,220,.85),
    inset 0 -3px 6px rgba(75,55,12,.55),
    inset 0 0 0 1px rgba(110,82,15,.30),
    0 1px 0 rgba(255,253,251,.9),
    0 20px 40px -22px rgba(43,42,40,.55),
    0 4px 12px -6px rgba(135,102,22,.45);
  /* HIDDEN until earned: the gold is shown ONLY on a live VALID result (the
     client adds .sealed to a valid .verdict). Space is reserved (no layout jump);
     only the bloom is gated. Revoked/tampered/unknown never reveal it. */
  opacity:0;transform:scale(.6);transition:opacity 360ms ease, transform 360ms ease;
}
.verdict .seal::before{content:"";position:absolute;inset:9%;border-radius:50%;
  box-shadow:inset 0 1px 2px rgba(75,55,12,.6),inset 0 -1px 1px rgba(255,247,220,.5),0 0 0 1px rgba(255,247,220,.18)}
.seal__ring{position:absolute;inset:0;width:100%;height:100%}
.seal__ring text{font-family:var(--label);font-size:6.4px;letter-spacing:1.15px;text-transform:uppercase;fill:#5C420C}
.seal__core{position:relative;display:grid;place-items:center;gap:2px;z-index:2}
.seal__script{font-family:var(--script);font-size:calc(var(--d) * .26);line-height:.9;color:#5C420C;
  text-shadow:0 1px 0 rgba(255,247,220,.55), 0 -1px 1px rgba(75,55,12,.5);margin-top:-.06em}
.seal__star{font-size:calc(var(--d) * .10);color:#6E520F;line-height:1;margin-bottom:-.04em;
  text-shadow:0 1px 0 rgba(255,247,220,.5)}
.seal__flash{position:absolute;inset:-8%;border-radius:50%;border:2px solid var(--gold-soft);
  opacity:0;z-index:-1;pointer-events:none}
/* EARNED: a live VALID result reveals + STAMPS the seal (the cinematic beat lands
   exactly when the re-verify confirms it), and flashes a single bloom ring. The
   height override here must also beat the shared .verdict.valid.sealed .seal rule. */
.verdict.valid.sealed .seal{height:var(--d);opacity:1;overflow:visible;
  animation:v-stamp 760ms cubic-bezier(.2,.85,.25,1.6) both}
.verdict.valid.sealed .seal__flash{animation:v-flash 700ms 60ms ease-out both}

/* (4) scroll cue — quiet invitation downward. */
.scrollcue{display:inline-flex;flex-direction:column;align-items:center;gap:6px;justify-self:center;
  font-family:var(--label);font-size:11px;letter-spacing:.26em;text-transform:uppercase;
  color:var(--gold-deep);text-decoration:none;animation:v-fade-in 700ms 700ms both ease-out}
/* The chevron is the GRAPHICAL affordance of a functional scroll link, so it must
   clear the WCAG 1.4.11 (non-text contrast) 3:1 floor — gold-soft (#CBA85E) was
   ~2.22:1 on cream. gold-deep (#876616, ~5.25:1) clears it and matches the cue's
   gold-deep text. (a11y audit flag, agent-a11y.) */
.scrollcue .chev{width:15px;height:15px;border-right:1.5px solid var(--gold-deep);
  border-bottom:1.5px solid var(--gold-deep);transform:rotate(45deg);animation:v-nudge 1.8s 1500ms ease-in-out infinite}
.scrollcue:hover{color:var(--ink)}
/* No height breakpoint needed: every hero element is sized min(rem, vw, svh), so it
   self-compacts CONTINUOUSLY by the smaller of width-fit and height-fit — fitting
   tall phones, short laptops, and landscape alike with the scroll cue always shown. */

/* ---- LANDING hero: the question, then the ONE action ----------------------
   The landing speaks the visitor's literal question ("Is it genuine?"); the
   credential page answers it ("Genuine."). No seal here — gold "Verified"
   iconography is never shown before anything is verified; the engraved lookup
   plate IS the centerpiece. Entrance mirrors the credential hero: staggered,
   snappy, fully present in under a second. */
.hero--landing .hero__core{max-width:640px;margin-inline:auto;gap:clamp(10px,1.9svh,22px)}
.hero--landing .eyebrow{animation:v-fade-in 480ms 60ms both ease-out}
/* the question reads as a QUESTION — sentence case (the shared .type-title
   uppercases for document titles; a shouted "IS IT GENUINE?" loses the voice). */
.hero--landing .type-title{font-size:clamp(28px,2.9rem,54px);letter-spacing:.015em;
  text-transform:none;animation:v-fade-up 560ms 120ms both ease-out}
.hero--landing .lead{font-family:var(--serif);font-style:italic;font-size:clamp(14px,1.1rem,18px);
  line-height:1.5;color:var(--ink-soft);max-width:44ch;margin:0;
  animation:v-fade-up 520ms 220ms both ease-out}

/* the engraved lookup plate — a tactile instrument, not a web form: raised
   cream plate, recessed (debossed) entry groove, one struck-gold action. */
.lookup-plate{width:min(100%,560px);margin-top:clamp(4px,1.2svh,14px);text-align:left;
  background:linear-gradient(180deg,#FFFEFB,#FBF6EC);
  border:1px solid rgba(176,137,47,.36);border-radius:14px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.9),
    0 24px 48px -28px rgba(43,42,40,.42),
    0 6px 18px -10px rgba(135,102,22,.30);
  padding:clamp(14px,2.2svh,22px) clamp(14px,2.5vw,22px);
  animation:v-fade-up 560ms 300ms both ease-out}
.lookup-plate .lp-label{display:block;font-family:var(--label);font-size:10.5px;
  letter-spacing:.24em;text-transform:uppercase;color:var(--gold-deep);margin:0 0 8px}
.lookup-plate .lp-row{display:flex;gap:10px;flex-wrap:wrap}
/* the groove: inset shadows read as engraving; the ID renders in inscriptional
   caps exactly as printed on the document (uppercase is also submitted — the
   route normalises server-side, so what you see is what verifies). */
.lookup-plate input{flex:1 1 200px;min-width:0;font-family:var(--label);letter-spacing:.07em;
  text-transform:uppercase;font-size:clamp(15px,1.02rem,17px);padding:13px 14px;border-radius:10px;
  box-shadow:inset 0 2px 4px rgba(60,50,30,.12),inset 0 -1px 0 rgba(255,255,255,.85)}
.lookup-plate input::placeholder{color:var(--ink-soft);opacity:.62;letter-spacing:.07em}
.lookup-plate .lp-go{font-size:15px;letter-spacing:.08em;padding:13px 26px;border-radius:10px}
.lookup-plate .lp-hint{font-family:var(--serif);font-size:12.5px;line-height:1.5;
  color:var(--ink-soft);margin:10px 0 0}
.hero--landing .honesty{max-width:46ch;font-family:var(--serif);font-size:clamp(10.5px,.78rem,12.5px);
  line-height:1.4;color:var(--ink-soft);margin:0;animation:v-fade-in 520ms 480ms both ease-out}

/* ---- LANDING below the fold: the method ledger + the ways ----------------- */
.how .method{list-style:none;margin:0;padding:0;display:grid;gap:clamp(14px,2.6vh,22px);counter-reset:m}
.how .method li{display:grid;grid-template-columns:auto 1fr;gap:14px 16px;align-items:start;
  background:#FFFEFB;border:1px solid rgba(176,137,47,.24);border-radius:12px;
  padding:16px 18px;box-shadow:inset 0 1px 0 rgba(255,255,255,.85),0 10px 24px -18px rgba(43,42,40,.35)}
.how .method .num{font-family:var(--label);font-size:12.5px;letter-spacing:.1em;color:var(--gold-deep);
  width:38px;height:38px;display:grid;place-items:center;border:1px solid rgba(176,137,47,.42);
  border-radius:50%;background:#FBF4E4;box-shadow:inset 0 1px 0 rgba(255,255,255,.8)}
.how .method h3{font-family:var(--display);font-weight:600;font-size:clamp(15px,1.08rem,18px);
  letter-spacing:.02em;color:var(--ink);margin:0 0 4px}
.how .method p{font-family:var(--serif);font-size:14.5px;line-height:1.55;color:var(--ink-soft);margin:0}
.how .ways{margin-top:clamp(30px,5vh,44px)}
.how .ways ul{list-style:none;margin:0;padding:0;display:grid;gap:9px}
.how .ways li{font-family:var(--serif);font-size:14.5px;line-height:1.5;color:var(--ink-soft)}
.how .ways li b{font-family:var(--label);font-weight:400;font-size:12px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--gold-deep);margin-right:.2ch}
.how .explainer{margin-top:clamp(34px,6vh,52px)}

/* ---- BELOW THE FOLD: progressive disclosure — the descent into full proof -- */
.proof{max-width:760px;margin:0 auto;padding:clamp(40px,8vh,96px) clamp(20px,5vw,32px) 24px}
.proof__intro{text-align:center;margin-bottom:clamp(32px,6vh,60px)}
.proof__intro .ek{font-family:var(--label);font-size:11.5px;letter-spacing:.26em;text-transform:uppercase;color:var(--gold-deep)}
.proof__intro h2{font-family:var(--display);font-weight:600;font-size:clamp(22px,3.4vw,30px);
  letter-spacing:.02em;color:var(--ink);margin:8px 0 0}
.proof .block-h{font-family:var(--label);font-size:12px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--gold-deep);margin:0 0 14px}

/* the status badge + checks ledger keep their shared look; just give them air. */
.proof .status{margin-top:0}
.proof .checks{margin-top:16px}

/* the facts grid + trust + downloads + explainer flow as calm sections. */
.proof .facts{margin-top:clamp(34px,6vh,52px);border-top:0}
.proof .facts h2{margin-top:0}
.proof .trust{margin-top:clamp(30px,5vh,44px)}
.proof .actions{margin-top:clamp(28px,5vh,40px)}
.proof .explainer{margin-top:clamp(34px,6vh,52px)}
.proof .panel{margin-top:18px}
/* plain-language glosses under the two technical downloads (#4). */
.proof .action-glosses{margin:12px 0 0;display:grid;grid-template-columns:auto 1fr;gap:3px 10px;
  font-size:12.5px;color:var(--ink-soft)}
.proof .action-glosses dt{font-family:var(--label);letter-spacing:.04em;color:var(--gold-deep)}
.proof .action-glosses dd{margin:0;font-family:var(--serif)}

/* ---- Motion (verify-scoped names so they never collide with the shared sheet) */
@keyframes v-fade-down{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
@keyframes v-fade-up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes v-fade-in{from{opacity:0}to{opacity:1}}
@keyframes v-stamp{
  0%{opacity:0;transform:translateY(-34px) scale(1.5) rotate(-8deg)}
  55%{opacity:1}
  70%{transform:translateY(0) scale(.93) rotate(0deg)}
  84%{transform:scale(1.035)}
  100%{opacity:1;transform:translateY(0) scale(1) rotate(0deg)}
}
@keyframes v-flash{0%{opacity:0;transform:scale(.6)}40%{opacity:.55}100%{opacity:0;transform:scale(1.25)}}
@keyframes v-nudge{0%,100%{transform:rotate(45deg) translate(0,0)}50%{transform:rotate(45deg) translate(2px,2px)}}

/* ---- Reduced motion: the verdict is fully present; a valid seal is struck +
   final (zero motion). Inherits the shared *{animation:none} reset. ----------
   The shared sheet's RM rule (.verdict.valid .seal{opacity:1;height:44px}) is for
   the OLD tiny flourish and matches NON-sealed valid too — left as-is it would
   reveal the medallion at scale(.6) for a no-JS + reduced-motion valid (the seal
   is meant to stay hidden until the client earns it). Re-assert the gate here at
   equal specificity (loads after the shared sheet, so it wins); the .sealed reveal
   below still beats it via !important when the gold is genuinely earned. */
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .hero .trustmark,.hero .verdict .word,.hero .verdict .sub,.hero .eyebrow,
  .hero .type-title,.hero .recipient,.scrollcue,
  .hero .verdict .glyph,.hero .verdict .hardfact,.hero .verdict .compare,
  .hero .verdict .honesty,
  .hero--landing .lead,.lookup-plate,.hero--landing .honesty{opacity:1!important;transform:none!important}
  .verdict.valid .seal{opacity:0;transform:none}
  .verdict.valid.sealed .seal{opacity:1!important;transform:none!important}
  .seal__flash{display:none}
}

/* The hero TYPE is rem-sized (stable — no vw feedback loop, so the longest title
   shrinks predictably and fits any WIDTH). For SHORT viewports only, compact the
   height-driven pieces so the whole fold + scroll cue still fit — keyed on svh /
   max-height, NEVER vw, so it cannot feedback-loop. The valid hero carries 3
   supporting lines (hard-fact/compare/honesty), so the band is wide (<=960). */
@media (max-height:960px){
  .hero{padding:clamp(6px,1.4svh,16px) clamp(20px,5vw,48px) clamp(6px,1.2svh,14px)}
  .hero__core{gap:clamp(4px,1svh,12px);padding:0}
  .hero .eyebrow{margin:0}
  .hero .type-title{font-size:clamp(20px,4.6svh,32px);margin:0}
  .hero .recipient{margin-top:clamp(3px,1svh,8px);font-size:clamp(14px,1.15rem,18px)}
  .hero .recipient .lbl{margin-bottom:2px;font-size:clamp(12px,.9rem,14px)}
  .hero .verdict{gap:clamp(3px,1svh,10px)}
  .hero .verdict .word{font-size:clamp(18px,3.6svh,28px)}
  .hero .verdict .sub{font-size:clamp(12px,.9rem,14px);margin-top:clamp(2px,.8svh,6px);max-width:32ch}
  .hero .verdict .seal{--d:clamp(48px,10svh,96px)}
  /* compact the bad-state glyph + the supporting lines on short viewports too, so
     they ride within the fold; the lines stay single + small. */
  .hero .verdict.revoked .glyph,.hero .verdict.bad .glyph,.hero .verdict.unknown .glyph{
    width:clamp(44px,9svh,86px);height:clamp(44px,9svh,86px);font-size:clamp(24px,6.5svh,56px)}
  .hero .verdict .hardfact{margin-top:clamp(2px,.7svh,5px);font-size:clamp(10px,.78rem,12px)}
  .hero .verdict .compare{margin-top:clamp(2px,.7svh,5px);font-size:clamp(11px,.85rem,13px)}
  .hero .verdict .honesty{margin-top:clamp(2px,.7svh,5px);font-size:clamp(10px,.74rem,11.5px);line-height:1.35}
  .hero .trustmark .mark{font-size:clamp(15px,3.4svh,18px)}
  .hero .trustmark .svc{font-size:clamp(9px,2svh,11px)}
  .scrollcue{font-size:10px;gap:3px}
  .scrollcue .chev{width:11px;height:11px}
  /* landing pieces ride the same band */
  .hero--landing .type-title{font-size:clamp(24px,5.4svh,44px)}
  .hero--landing .lead{font-size:clamp(12.5px,.95rem,15px)}
  .lookup-plate{padding:clamp(10px,1.8svh,18px) clamp(12px,2.2vw,20px);margin-top:clamp(2px,.8svh,10px)}
  .lookup-plate input{padding:11px 12px}
  .lookup-plate .lp-go{padding:11px 20px}
  .lookup-plate .lp-hint{margin-top:8px;font-size:11.5px}
  .hero--landing .honesty{font-size:clamp(10px,.74rem,11.5px)}
}
/* Landscape phones / ultra-short (<=520px tall): the VALID hero carries the most
   content (seal + 3 supporting lines), so shrink the seal to a token and tighten
   to the bone — every state still fits one fold with the scroll cue shown. */
@media (max-height:520px){
  .hero{padding:clamp(4px,1svh,12px) clamp(16px,5vw,40px) clamp(4px,1svh,10px)}
  .hero__core{gap:clamp(2px,.6svh,6px)}
  .hero .trustmark .mark{font-size:clamp(13px,3svh,16px)}
  .hero .trustmark .svc{font-size:clamp(8px,1.8svh,10px)}
  .hero .eyebrow{font-size:clamp(9px,.62rem,11px);letter-spacing:.26em}
  .hero .type-title{font-size:clamp(16px,3.3svh,23px)}
  .hero .recipient{margin-top:clamp(1px,.4svh,3px);font-size:clamp(12px,.95rem,15px)}
  .hero .recipient .lbl{font-size:clamp(10px,.78rem,12px);margin-bottom:0}
  .hero .verdict{gap:clamp(1px,.4svh,4px)}
  .hero .verdict .sub{font-size:clamp(9.5px,.72rem,11.5px);margin-top:clamp(1px,.35svh,3px);max-width:38ch}
  .hero .docmeta{margin-top:clamp(2px,.5svh,5px)}
  .hero .verdict .seal{--d:clamp(26px,5.6svh,44px)}
  .hero .verdict .word{font-size:clamp(15px,2.7svh,20px)}
  .hero .verdict .hardfact{font-size:clamp(8.5px,.68rem,10.5px);margin-top:clamp(1px,.35svh,3px)}
  .hero .verdict .compare{font-size:clamp(9px,.72rem,11px);margin-top:clamp(1px,.35svh,3px)}
  .hero .verdict .honesty{font-size:clamp(8.5px,.66rem,10px);margin-top:clamp(1px,.35svh,3px);line-height:1.25}
  .hero .verdict.revoked .glyph,.hero .verdict.bad .glyph,.hero .verdict.unknown .glyph{
    width:clamp(30px,6svh,46px);height:clamp(30px,6svh,46px);font-size:clamp(16px,4svh,28px)}
  .scrollcue{font-size:9px;gap:2px}
  .scrollcue .chev{width:9px;height:9px}
  /* landing on landscape phones: keep every element, shrink to the bone */
  .hero--landing .hero__core{gap:clamp(3px,1svh,8px)}
  .hero--landing .type-title{font-size:clamp(19px,4.4svh,26px)}
  .hero--landing .lead{font-size:clamp(11px,.8rem,12.5px);max-width:54ch}
  .lookup-plate{padding:8px 12px;margin-top:2px}
  .lookup-plate .lp-label{margin-bottom:5px;font-size:9.5px}
  .lookup-plate input{padding:8px 10px;font-size:clamp(13px,.9rem,15px)}
  .lookup-plate .lp-go{padding:8px 16px;font-size:13px}
  .lookup-plate .lp-hint{margin-top:6px;font-size:10.5px}
  .hero--landing .honesty{font-size:clamp(9px,.68rem,10px);line-height:1.3}
}`;
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

  // The record's lifecycle (valid/revoked) drives the "Status" pill in the details
  // grid below. The TOP verdict + Tier-2 badge use the same record outcome EXCEPT
  // for a cryptographically-valid UPLOAD: there we refuse to assert the holder's
  // FILE is authentic from the id/QR alone (a copied QR/number can sit on any
  // file), leading with a cautious file-gate that earns green only on a byte-match.
  const recordBadge = outcomeBadge(outcome, issuer);
  const fileGate = kind === 'upload' && outcome === 'valid';
  const badge = fileGate ? UPLOAD_FILEGATE_BADGE : recordBadge;
  const ssrStatusClass = badge.cls;
  const ssrStatusLabel = badge.label;
  const ssrStatusNote = badge.note;

  // Tier 1 — the plain-language verdict, server-rendered so the human sentence is
  // correct with JS off. The `sealed` class is added by the client ONLY on a live
  // 'valid' result / a confirmed file match (gold's scarcity is the trust signal).
  const verdict = fileGate ? UPLOAD_FILEGATE_VERDICT : verdictCopy(outcome);

  // The hero's verdict-supporting lines. A fileGate upload reports outcome 'valid'
  // at the RECORD level but its FILE is unconfirmed, so the affirmative hardfact /
  // compare lines are suppressed there (the file-gate copy already speaks for it);
  // they show only on a genuinely-affirmative cert/letter verdict. The honesty line
  // shows in EVERY state. heroCompareLine itself also excludes uploads.
  const heroAffirmative = outcome === 'valid' && !fileGate;
  const heroHardFactHtml = heroHardFact(heroAffirmative, input.trustedTimestamp);
  const heroCompareHtml = heroCompareLine(heroAffirmative, kind);
  const heroHonestyHtml = heroHonestyLine();

  // The upload file-gate dropzone (progressive enhancement; the form also posts to
  // /api/verify/file without JS). Only a byte-for-byte match flips the page green.
  const fileGateHtml = fileGate
    ? `
        <!-- Anti-spoof FILE gate (uploads only): a scanned QR/number proves the
             RECORD exists, never that THIS file is the attested one. Green is
             earned solely when the dropped file's bytes match /api/verify/file. -->
        <div class="filecheck" id="filecheck">
          <p class="fc-lead">Confirm the document you&rsquo;re holding</p>
          <p class="fc-why">A QR code or document number can be copied onto any file. So we verify the file itself: its exact bytes must match the post-quantum signature we issued, and an altered or substituted file cannot pass.</p>
          <form id="fc-form" method="POST" action="/api/verify/file" enctype="multipart/form-data">
            <input type="hidden" name="credentialId" value="${escapeHtml(id)}">
            <div class="fc-drop" id="fc-drop">
              <label class="fc-cta" for="fc-input">Drop the PDF here, or choose a file</label>
              <input class="fc-input" id="fc-input" name="file" type="file" accept="application/pdf,.pdf" required>
              <button class="btn primary" type="submit" id="fc-submit">Check this file</button>
            </div>
          </form>
          <p class="fc-note">Your file is checked against the ML&#8209;DSA&#8209;87 signature and tamper&#8209;evident log we issued for this document, not a simple checksum. Fingerprint <code class="mono">${escapeHtml(maskHash(record.pdfSha256))}</code>.</p>
          <p class="fc-msg" id="fc-msg" role="status" aria-live="polite"></p>
        </div>`
    : '';

  // Pre-render each check row with its server-computed state, so the ledger is
  // meaningful (and honest) before any script runs.
  // For an upload, the FIRST check is the decisive file-integrity check, and it is
  // NEUTRAL until the verifier provides the file — we never claim a file matches
  // from the id/QR alone. The four record-level checks follow.
  const checkRows: Array<{ key: keyof VerificationChecks; label: string }> = [
    ...(fileGate
      ? [{ key: 'hashMatch' as const, label: 'Your file matches the attested document, byte for byte' }]
      : []),
    { key: 'mldsaSignature', label: 'Post-quantum signature (ML-DSA-87)' },
    // Plain gloss on the jargon (#4): say what the log IS, in one breath.
    { key: 'logInclusion', label: 'Transparency-log inclusion: recorded in our public, tamper-evident log' },
    { key: 'anchorProof', label: 'External anchor (public GitHub log)' },
    { key: 'notRevoked', label: 'Not revoked by issuer' },
  ];
  const checksHtml = checkRows
    .map((row) => {
      // The upload file-integrity row stays NEUTRAL server-side: the id/QR lookup
      // has not seen the holder's file, so it must never render as already passed.
      const isFileRow = fileGate && row.key === 'hashMatch';
      const cls = isFileRow ? '' : checkClass(row.key, input.verification.checks[row.key]);
      // Carry pass/fail to assistive tech (the .ic glyph + colour are aria-hidden).
      const word = isFileRow
        ? 'Awaiting your file'
        : cls === 'pass'
          ? 'Passed'
          : cls === 'fail'
            ? 'Failed'
            : cls === 'warn'
              ? 'Pending'
              : 'Checking';
      const fileAttr = isFileRow ? ' data-filecheck="1"' : '';
      return `          <li data-check="${row.key}"${fileAttr} class="${cls}"><span class="ic" aria-hidden="true"></span><span>${escapeHtml(row.label)}</span><span class="sr-only" data-check-status>${word}</span></li>`;
    })
    .join('\n');

  const section63Path = `/api/credentials/${encodeURIComponent(id)}/section63`;
  const evidencePath = `/api/credentials/${encodeURIComponent(id)}/evidence`;
  const verifyApiPath = `/api/verify/${encodeURIComponent(id)}`;

  // The "How we know it is genuine" intro reads honestly across states: the proof
  // is the evidence regardless of verdict, so this header never asserts validity.
  const proofIntroEyebrow = 'The evidence';
  const proofIntroTitle = 'The proof behind this verdict';

  // The hero crown is the "dmj.one" wordmark + a service tagline. The issuer
  // string IS "dmj.one Trust Services", so strip the brand prefix to avoid a
  // doubled "dmj.one dmj.one …"; fall back to the full issuer if it doesn't match.
  const issuerTagline = issuer.replace(/^dmj\.one\s+/i, '').trim() || issuer;

  return `${head(nonce, face.pageTitle)}
<body data-credential-id="${escapeHtml(id)}" data-verify-url="${escapeHtml(verifyApiPath)}" data-filegate="${fileGate ? '1' : '0'}">
  <a class="skip" href="#main">Skip to content</a>
  <main id="main" class="wrap verify">

    <!-- ============ ABOVE THE FOLD: the minimal, cinematic hero ============ -->
    <!-- One thing, beautifully: the document identity, THE VERDICT, the struck
         gold seal (revealed + stamped by the client ONLY on a live VALID), and a
         scroll cue. The verdict + seal gating are server-correct without JS. -->
    <section class="hero" aria-labelledby="cred-title">
      <span class="hero__frame" aria-hidden="true"></span>

      <header class="brand trustmark">
        <span class="mark"><b>dmj</b>.one</span>
        <span class="svc">${escapeHtml(issuerTagline)}</span>
      </header>

      <div class="hero__core">
        <div class="identity">
${face.hero}
        </div>

        <!-- The plain-language verdict — the hero sentence, server-rendered from
             the authoritative outcome so it is correct without JavaScript. The
             struck gold seal lives INSIDE .verdict so .verdict.valid.sealed gates
             it: shown + stamped on a live VALID, withheld on every other state. -->
        <div class="verdict ${verdict.cls}" id="verdict">
${seal()}
          <p class="word"><span class="glyph" aria-hidden="true">${escapeHtml(verdict.glyph)}</span><span id="verdict-word">${escapeHtml(verdict.word)}</span></p>
${heroHardFactHtml ? '' : `          <p class="sub" id="verdict-sub">${escapeHtml(verdict.sub)}</p>`}
${heroHardFactHtml}${heroCompareHtml}
${heroHonestyHtml}
        </div>
      </div>

      <a class="scrollcue" href="#proof">
        <span>See the proof</span>
        <span class="chev" aria-hidden="true"></span>
      </a>
    </section>

    <!-- ============ BELOW THE FOLD: progressive disclosure of the proof ===== -->
    <section class="proof" id="proof" aria-labelledby="proof-h">
      <div class="proof__intro">
        <p class="ek">${proofIntroEyebrow}</p>
        <h2 id="proof-h">${proofIntroTitle}</h2>
      </div>

      <!-- The live status badge + per-check ledger, pre-rendered with the
           server-computed verdict so they are meaningful without JavaScript. The
           client re-runs the same checks live and re-paints these rows. -->
      <h3 class="block-h" id="checks-h">Cryptographic checks</h3>
      <div class="status ${ssrStatusClass}" id="status" role="status" aria-live="polite" data-ssr-outcome="${escapeHtml(outcome)}">
        <span class="dot" aria-hidden="true"></span>
        <span class="txt">
          <b id="status-label">${ssrStatusLabel}</b>
          <span id="status-note">${escapeHtml(ssrStatusNote)}</span>
        </span>
      </div>
${fileGateHtml}
      <ul class="checks" id="checks" aria-labelledby="checks-h">
${checksHtml}
      </ul>

${flourish()}

      <section class="facts" aria-labelledby="facts-h">
        <h3 class="block-h" id="facts-h">${kind === 'certificate' ? 'Credential details' : 'Document details'}</h3>
        <dl class="grid">
${face.detailRows}
          <dt>Status</dt><dd><span class="pill ${recordBadge.cls}">${recordBadge.label}</span></dd>
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
${timestampLine(input.trustedTimestamp)}

      <div class="actions">
        <a class="btn secondary" href="${section63Path}" id="dl-63">Download §63 certificate of authenticity</a>
        <a class="btn secondary" href="${evidencePath}" id="dl-evidence" download>Download court-ready evidence bundle</a>
        <a class="btn" href="#download-panel">Are you the recipient? Get your signed certificate</a>
      </div>
      <!-- Plain glosses (#4): translate the two jargon labels above into one line
           each, honestly and without overclaim. -->
      <dl class="action-glosses">
        <dt>§63 certificate of authenticity</dt><dd>a legal certificate of authenticity under BSA 2023.</dd>
        <dt>Court-ready evidence bundle</dt><dd>everything an expert needs to re-verify this offline.</dd>
      </dl>

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
        <h3 class="block-h" id="tamper-h">How tamper detection works</h3>
        <p>The certificate's exact bytes are hashed and that hash is covered by a post-quantum signature.
        Change a single bit anywhere in the file and the hash no longer matches, so verification reports
        <strong>TAMPERED</strong>. Change any field and the signature itself fails. Try it: upload a real or
        altered copy on the verification API and watch the result flip.</p>
        <p class="flip" aria-hidden="true">
          <span class="bit">0</span><span class="bit">1</span><span class="bit changed">0</span><span class="bit">1</span>
          <span>&nbsp;one flipped bit &rarr; TAMPERED</span>
        </p>
      </section>
    </section>

    <footer class="foot">
      Verified at <a href="${escapeHtml(input.verifyBaseUrl)}">${escapeHtml(input.verifyBaseUrl)}</a> ·
      ${escapeHtml(IDENTITY.trustService)} · ${escapeHtml(IDENTITY.email)} ·
      <span class="motto">${escapeHtml(IDENTITY.motto)}</span>
    </footer>
  </main>

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
    var verdictGlyphEl = verdictEl ? verdictEl.querySelector(".glyph") : null;
    var fileGate = body.getAttribute("data-filegate") === "1";
    if(!verifyUrl || !statusEl) return;

    // Tier 2 (badge) + Tier 1 (plain-language verdict) copy, mirrored from the
    // server (verdictCopy + outcomeBadge) so a live re-paint keeps BOTH tiers
    // honest. Bad-state words LEAD WITH THE WARNING (the eye must not land on a
    // reassuring word first), and each entry carries its colour-independent glyph
    // so setStatus can refresh the hero alarm mark on a repaint (the SSR glyph is
    // otherwise frozen). The badge NOTE states the technical fact WITHOUT echoing
    // the human verdict word; the label is the lifecycle term the pill/checks share.
    var COPY = {
      valid:    { cls:"valid",    label:"VALID",    note:"The post-quantum signature verifies against this record, which is in the transparency log and not revoked.",
                  word:"Genuine.", sub:"Issued by dmj.one Trust Services, and unaltered since.", glyph:"✓" },
      revoked:  { cls:"revoked",  label:"REVOKED",  note:"Issued by dmj.one, then withdrawn by the issuer. It should not be relied upon.",
                  word:"Revoked.", sub:"Issued by dmj.one, then withdrawn. Do not rely on it.", glyph:"⊘" },
      tampered: { cls:"bad",      label:"TAMPERED", note:"The data shown does not match what was cryptographically signed.",
                  word:"Altered.", sub:"This does not match what was signed. Do not rely on it.", glyph:"✕" },
      unknown:  { cls:"unknown",  label:"UNKNOWN",  note:"We could not confirm this against our records. Check the ID, or contact the issuer.",
                  word:"Not confirmed.", sub:"We couldn't confirm this. Check the ID or contact the issuer.", glyph:"—" }
    };

    function setStatus(kind){
      var c = COPY[kind] || COPY.unknown;
      // Tier 2: the cryptographic badge.
      statusEl.className = "status " + c.cls;
      if(labelEl) labelEl.textContent = c.label;
      if(noteEl) noteEl.textContent = c.note;
      // Tier 1: the plain-language verdict. The SEAL blooms only on VALID; on a bad
      // state the hero shows the warning GLYPH instead (filled by CSS on the
      // .revoked/.bad/.unknown classes), so refresh the glyph text too.
      if(verdictEl){
        verdictEl.className = "verdict " + c.cls + (kind === "valid" ? " sealed" : "");
      }
      if(verdictGlyphEl && c.glyph) verdictGlyphEl.textContent = c.glyph;
      if(verdictWordEl) verdictWordEl.textContent = c.word;
      if(verdictSubEl) verdictSubEl.textContent = c.sub;
    }

    function paintChecks(checks, paintFile){
      if(!checksEl) return;
      checksEl.hidden = false;
      var items = checksEl.querySelectorAll("li[data-check]");
      for(var i=0;i<items.length;i++){
        var li = items[i];
        // The file-integrity row is painted ONLY by the file verification, never by
        // the id/QR record re-check (which has not seen the holder's file).
        if(!paintFile && li.getAttribute("data-filecheck") === "1") continue;
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

    // FILE-confirmation verdicts (uploads): the earned green / the spoof-catching red.
    var FILECOPY = {
      match:    { cls:"valid", label:"AUTHENTIC FILE", note:"This file matches the attested record exactly, byte for byte.",
                  word:"Authentic.", sub:"This is the exact document dmj.one attested." },
      mismatch: { cls:"bad", label:"FILE DOES NOT MATCH", note:"This file is not the document we attested.",
                  word:"This file does not match.", sub:"It is NOT the document we attested. A QR code or document number may have been copied onto a different file." }
    };
    function setFileVerdict(k){
      var c = FILECOPY[k]; if(!c) return;
      statusEl.className = "status " + c.cls;
      if(labelEl) labelEl.textContent = c.label;
      if(noteEl) noteEl.textContent = c.note;
      if(verdictEl) verdictEl.className = "verdict " + c.cls + (k === "match" ? " sealed" : "");
      if(verdictGlyphEl) verdictGlyphEl.textContent = (k === "match" ? "\\u2713" : "\\u2715");
      if(verdictWordEl) verdictWordEl.textContent = c.word;
      if(verdictSubEl) verdictSubEl.textContent = c.sub;
    }
    function wireFileCheck(){
      var fcForm = document.getElementById("fc-form");
      var fcInput = document.getElementById("fc-input");
      var fcDrop = document.getElementById("fc-drop");
      var fcMsg = document.getElementById("fc-msg");
      var fcSubmit = document.getElementById("fc-submit");
      if(!fcForm || !fcInput) return;
      function run(file){
        if(!file) return;
        if(fcMsg){ fcMsg.className = "fc-msg"; fcMsg.textContent = "Verifying your file\\u2026"; }
        if(fcSubmit){ fcSubmit.disabled = true; }
        // Re-run the WHOLE chain against THIS file (hash + ML-DSA-87 signature +
        // transparency log + revocation), visibly — never a silent checksum.
        statusEl.className = "status checking";
        if(labelEl) labelEl.textContent = "Verifying your file";
        if(noteEl) noteEl.textContent = "Hashing your file and checking it against the post-quantum signature, transparency log and revocation\\u2026";
        if(checksEl){ var rr = checksEl.querySelectorAll("li[data-check]"); for(var q=0;q<rr.length;q++){ rr[q].classList.add("run"); } }
        var startedF = Date.now();
        var fd = new FormData();
        fd.append("credentialId", body.getAttribute("data-credential-id"));
        fd.append("file", file);
        fetch("/api/verify/file", { method:"POST", headers:{ "accept":"application/json" }, body: fd })
          .then(function(r){ return r.ok ? r.json() : Promise.reject(new Error("verify failed")); })
          .then(function(result){
            var waitF = Math.max(0, 600 - (Date.now() - startedF));
            setTimeout(function(){
              if(result && result.checks){ paintChecks(result.checks, true); }
              if(result && result.outcome === "valid"){
                setFileVerdict("match");
                if(fcMsg){ fcMsg.className = "fc-msg ok"; fcMsg.textContent = "Verified: this file is the document we attested."; }
              } else if(result && result.outcome === "tampered"){
                setFileVerdict("mismatch");
                if(fcMsg){ fcMsg.className = "fc-msg err"; fcMsg.textContent = "This file does NOT match the attested document."; }
              } else {
                if(fcMsg){ fcMsg.className = "fc-msg err"; fcMsg.textContent = "We could not confirm this file against the record."; }
              }
              if(fcSubmit){ fcSubmit.disabled = false; }
            }, waitF);
          })
          .catch(function(){
            if(checksEl){ var lc = checksEl.querySelectorAll("li[data-check]"); for(var z=0;z<lc.length;z++){ lc[z].classList.remove("run"); } }
            if(fcMsg){ fcMsg.className = "fc-msg err"; fcMsg.textContent = "Something went wrong checking the file. Please try again."; }
            if(fcSubmit){ fcSubmit.disabled = false; }
          });
      }
      fcInput.addEventListener("change", function(){ run(fcInput.files && fcInput.files[0]); });
      fcForm.addEventListener("submit", function(ev){ ev.preventDefault(); run(fcInput.files && fcInput.files[0]); });
      if(fcDrop){
        ["dragenter","dragover"].forEach(function(t){ fcDrop.addEventListener(t, function(ev){ ev.preventDefault(); fcDrop.classList.add("over"); }); });
        ["dragleave","dragend"].forEach(function(t){ fcDrop.addEventListener(t, function(ev){ ev.preventDefault(); fcDrop.classList.remove("over"); }); });
        fcDrop.addEventListener("drop", function(ev){
          ev.preventDefault(); fcDrop.classList.remove("over");
          var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
          if(f){ try { fcInput.files = ev.dataTransfer.files; } catch(e){} run(f); }
        });
      }
    }

    if(fileGate){
      // Uploads: wire the dropzone (the FILE verdict), AND run the four RECORD
      // checks live (a real server re-verification) before ticking them — but
      // NEVER flip the top verdict green from the id/QR alone. The record is
      // genuine; the FILE is what stays unconfirmed until the bytes match.
      wireFileCheck();
      statusEl.className = "status checking";
      if(labelEl) labelEl.textContent = "Verifying record";
      if(noteEl) noteEl.textContent = "Running the post-quantum signature, transparency-log, anchor and revocation checks\\u2026";
      if(checksEl){ checksEl.hidden = false; var ru = checksEl.querySelectorAll("li[data-check]:not([data-filecheck])"); for(var k=0;k<ru.length;k++){ ru[k].classList.add("run"); } }
      var startedU = Date.now();
      fetch(verifyUrl, { headers:{ "accept":"application/json" } })
        .then(function(res){ return res.ok ? res.json() : Promise.reject(new Error("verify failed")); })
        .then(function(result){
          var waitU = Math.max(0, 700 - (Date.now() - startedU));
          setTimeout(function(){
            paintChecks(result.checks);
            if(result.outcome === "valid"){
              statusEl.className = "status unconfirmed";
              if(labelEl) labelEl.textContent = "RECORD VERIFIED \\u00b7 FILE NOT CONFIRMED";
              if(noteEl) noteEl.textContent = "The attestation record is genuine and intact. Confirm the file itself to prove your copy is the one we attested.";
            } else {
              setStatus(result.outcome);
            }
          }, waitU);
        })
        .catch(function(){
          // record re-verify unreachable: reveal the SSR-rendered record checks.
          if(checksEl){ var lf = checksEl.querySelectorAll("li[data-check]"); for(var y=0;y<lf.length;y++){ lf[y].classList.remove("run"); } }
          statusEl.className = "status unconfirmed";
          if(labelEl) labelEl.textContent = "FILE NOT YET CONFIRMED";
          if(noteEl) noteEl.textContent = "The attestation record is genuine and intact. Confirm the file itself to prove your copy is the one we attested.";
        });
    } else {
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
        // Network/verify error: STOP the spinner and fall back to the server-rendered
        // verdict + per-check states (already correct, SSR'd) — never spin forever.
        if(checksEl){ var lx = checksEl.querySelectorAll("li[data-check]"); for(var w=0;w<lx.length;w++){ lx[w].classList.remove("run"); } }
        setStatus(statusEl.getAttribute("data-ssr-outcome") || "unknown");
      });
    }

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
