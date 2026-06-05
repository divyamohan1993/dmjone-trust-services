/**
 * The public credential page — artifact B from the spec: deliberately distinct
 * from the gated PDF. Where the PDF is a paper letterhead, this is a web-native
 * verification *experience*: a live "quantum-verifying" sequence, a status
 * badge, the full HR/legal fields a recruiter or court needs, an honest trust
 * statement, the §63 download, and a password-gated download panel.
 *
 * Hard rules enforced here:
 *  - NO handwritten-signature image, NO direct certificate-PDF link. The
 *    signature lives only inside the gated PDF.
 *  - The HR/legal fields are rendered SERVER-SIDE so the page is meaningful
 *    with JavaScript off, screen-reader friendly, and court-presentable. The
 *    animation is pure progressive enhancement over /api/verify/:id.
 *  - Honest wording: self-signed cryptographic attestation by an independent
 *    educational initiative — never a claim of a licensed-CA DSC or government
 *    accreditation.
 *  - Nonce CSP: the single inline <style> and <script> carry the request nonce;
 *    no inline event handlers (they would be blocked by our own CSP).
 *
 * Design tokens come from @dmjone/brand so this surface and the PDF stay in
 * lockstep on palette and type.
 */

import { COLORS, FONTS, IDENTITY } from '@dmjone/brand';
import type {
  CredentialRecord,
  CredentialType,
  VerificationChecks,
  VerificationOutcome,
} from '@dmjone/shared';
import { escapeHtml } from './escape.js';

/** Human label for each credential type code. */
const TYPE_LABEL: Record<CredentialType, string> = {
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

/** The shared <head> + design system, parameterised by the per-request nonce. */
function head(nonce: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex">
<style nonce="${nonce}">
  :root{
    --ink:${COLORS.ink}; --ink-soft:${COLORS.inkSoft}; --paper:${COLORS.paper};
    --gold:${COLORS.gold}; --gold-deep:${COLORS.goldDeep}; --gold-soft:${COLORS.goldSoft};
    --serif:${FONTS.serif}; --display:${FONTS.display}; --label:${FONTS.label}; --script:${FONTS.script};
    --ok:#1F7A4D; --ok-soft:#E5F2EA; --warn:#9A6B12; --warn-soft:#F6ECD6; --bad:#9A2B2B; --bad-soft:#F6E2E0;
  }
  *{ box-sizing:border-box; }
  html,body{ margin:0; padding:0; }
  body{
    font-family:var(--serif); color:var(--ink); background:var(--paper);
    line-height:1.6; -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
    /* soft watercolour corners echoing the dmj.one logo — the brand thread */
    background-image:
      radial-gradient(60% 42% at 0% 0%,    rgba(243,205,210,.40), transparent 60%),
      radial-gradient(52% 38% at 100% 0%,  rgba(214,210,235,.36), transparent 60%),
      radial-gradient(58% 40% at 100% 100%,rgba(248,224,205,.40), transparent 62%),
      radial-gradient(50% 34% at 0% 100%,  rgba(238,210,222,.32), transparent 60%);
    background-attachment:fixed;
  }
  a{ color:var(--gold-deep); }
  .wrap{ max-width:880px; margin:0 auto; padding:clamp(20px,4vw,56px) clamp(16px,4vw,32px) 72px; }
  .skip{ position:absolute; left:-9999px; top:auto; }
  .skip:focus{ left:16px; top:12px; background:var(--ink); color:var(--paper); padding:8px 14px; border-radius:6px; z-index:10; }

  header.brand{ display:flex; align-items:baseline; gap:.7ch; flex-wrap:wrap; padding-bottom:18px; border-bottom:1px solid rgba(176,137,47,.28); }
  .brand .mark{ font-family:var(--display); font-size:clamp(22px,3.4vw,30px); letter-spacing:.01em; color:var(--ink); }
  .brand .mark b{ color:var(--gold-deep); font-weight:700; }
  .brand .svc{ font-family:var(--label); font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:var(--gold-deep); }
  .brand .descriptor{ flex-basis:100%; font-size:12.5px; color:var(--ink-soft); margin-top:2px; }

  /* the verifying card — the centrepiece, a tactile gold-framed panel */
  .card{
    position:relative; margin-top:26px; background:#FFFFFF;
    border:1px solid rgba(176,137,47,.34); border-radius:16px;
    box-shadow:0 1px 0 rgba(176,137,47,.18), 0 18px 44px -28px rgba(43,42,40,.45);
    padding:clamp(20px,3.4vw,34px);
  }
  .card::before{ content:""; position:absolute; inset:6px; border:1px solid rgba(203,168,94,.45); border-radius:11px; pointer-events:none; }

  .eyebrow{ font-family:var(--label); font-size:11.5px; letter-spacing:.2em; text-transform:uppercase; color:var(--gold-deep); }
  .type-title{ font-family:var(--display); font-weight:700; font-size:clamp(26px,4.6vw,40px); letter-spacing:.06em; text-transform:uppercase; color:var(--ink); margin:6px 0 0; line-height:1.08; }
  .recipient{ font-family:var(--label); font-size:clamp(17px,2.4vw,21px); letter-spacing:.06em; color:var(--ink); margin-top:14px; }
  .recipient .lbl{ display:block; font-family:var(--serif); font-style:italic; font-size:13px; letter-spacing:0; color:var(--ink-soft); margin-bottom:2px; }

  /* live status badge */
  .status{ display:flex; align-items:center; gap:12px; margin-top:22px; padding:14px 16px; border-radius:12px; border:1px solid transparent; }
  .status .dot{ width:14px; height:14px; border-radius:50%; flex:0 0 auto; }
  .status .txt{ font-family:var(--label); letter-spacing:.05em; }
  .status .txt b{ display:block; font-size:16px; }
  .status .txt span{ display:block; font-size:12.5px; color:var(--ink-soft); font-family:var(--serif); }
  .status.checking{ background:#FBF6EA; border-color:var(--warn-soft); }
  .status.checking .dot{ background:var(--gold); animation:pulse 1.1s ease-in-out infinite; }
  .status.valid{ background:var(--ok-soft); border-color:#BFE0CC; }
  .status.valid .dot{ background:var(--ok); }
  .status.revoked,.status.bad{ background:var(--bad-soft); border-color:#E7C3C0; }
  .status.revoked .dot,.status.bad .dot{ background:var(--bad); }
  .status.unknown{ background:#F1EEEA; border-color:#DAD3CA; }
  .status.unknown .dot{ background:var(--ink-soft); }

  /* the live check ledger */
  .checks{ list-style:none; margin:18px 0 0; padding:0; display:grid; gap:8px; }
  .checks li{ display:flex; align-items:center; gap:10px; font-size:14px; color:var(--ink-soft); }
  .checks li .ic{ width:18px; height:18px; flex:0 0 auto; border-radius:50%; border:1.5px solid currentColor; position:relative; color:var(--ink-soft); }
  .checks li.run .ic{ color:var(--gold); animation:spin 1s linear infinite; border-top-color:transparent; }
  .checks li.pass{ color:var(--ok); }
  .checks li.pass .ic{ color:var(--ok); border-color:var(--ok); }
  .checks li.pass .ic::after{ content:""; position:absolute; left:5px; top:2px; width:5px; height:9px; border:solid var(--ok); border-width:0 2px 2px 0; transform:rotate(45deg); }
  .checks li.warn{ color:var(--warn); }
  .checks li.warn .ic{ color:var(--warn); border-color:var(--warn); }
  .checks li.fail{ color:var(--bad); }
  .checks li.fail .ic{ color:var(--bad); border-color:var(--bad); }
  .checks li.fail .ic::after{ content:"\\00d7"; position:absolute; left:3px; top:-3px; font-size:15px; line-height:1; }

  /* HR/legal fact table */
  .facts{ margin-top:26px; border-top:1px solid rgba(176,137,47,.28); }
  .facts h2{ font-family:var(--label); font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:var(--gold-deep); margin:18px 0 10px; }
  dl.grid{ display:grid; grid-template-columns:minmax(140px,32%) 1fr; gap:10px 18px; margin:0; }
  dl.grid dt{ font-family:var(--serif); font-style:italic; color:var(--ink-soft); font-size:14px; }
  dl.grid dd{ margin:0; font-family:var(--label); letter-spacing:.02em; color:var(--ink); font-size:14.5px; }
  .pill{ display:inline-block; font-family:var(--label); font-size:12px; letter-spacing:.06em; text-transform:uppercase; padding:3px 10px; border-radius:999px; }
  .pill.valid{ background:var(--ok-soft); color:var(--ok); }
  .pill.revoked{ background:var(--bad-soft); color:var(--bad); }
  code.mono{ font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:13px; background:#F4EFE6; padding:2px 7px; border-radius:6px; color:var(--ink); }

  .trust{ margin-top:24px; padding:16px 18px; background:#FBF7EF; border:1px solid rgba(176,137,47,.30); border-radius:12px; font-size:13.5px; color:var(--ink-soft); }
  .trust strong{ color:var(--ink); font-weight:600; }

  .actions{ display:flex; flex-wrap:wrap; gap:12px; margin-top:26px; }
  .btn{ font-family:var(--label); letter-spacing:.05em; font-size:14px; padding:12px 18px; border-radius:10px; border:1px solid var(--gold); background:linear-gradient(180deg,#FBF4E4,#F3E7CC); color:var(--gold-deep); text-decoration:none; cursor:pointer; display:inline-flex; align-items:center; gap:8px; }
  .btn:hover{ background:linear-gradient(180deg,#FCF7EC,#EFDFBE); }
  .btn:focus-visible{ outline:3px solid var(--gold-soft); outline-offset:2px; }
  .btn.primary{ background:linear-gradient(180deg,var(--gold),var(--gold-deep)); color:#FFF; border-color:var(--gold-deep); }

  details.panel{ margin-top:18px; border:1px solid rgba(176,137,47,.30); border-radius:12px; background:#fff; overflow:hidden; }
  details.panel>summary{ cursor:pointer; list-style:none; padding:14px 18px; font-family:var(--label); letter-spacing:.04em; color:var(--ink); background:#FBF7EF; }
  details.panel>summary::-webkit-details-marker{ display:none; }
  details.panel>summary::after{ content:"+"; float:right; color:var(--gold-deep); }
  details.panel[open]>summary::after{ content:"\\2212"; }
  .panel .inner{ padding:16px 18px; }
  .panel label{ display:block; font-size:13px; color:var(--ink-soft); margin-bottom:6px; }
  .panel input[type=password]{ width:100%; padding:11px 12px; font-size:15px; border:1px solid #D8CFC0; border-radius:8px; font-family:var(--serif); }
  .panel input:focus-visible{ outline:3px solid var(--gold-soft); outline-offset:1px; border-color:var(--gold); }
  .panel .hint{ font-size:12.5px; color:var(--ink-soft); margin-top:8px; }
  .panel .msg{ font-size:13.5px; margin-top:10px; min-height:1.2em; }
  .panel .msg.err{ color:var(--bad); }
  .panel .msg.ok{ color:var(--ok); }
  .panel .submit-row{ margin-top:12px; }
  .trust-spaced{ margin-top:22px; }

  .explainer{ margin-top:30px; font-size:13.5px; color:var(--ink-soft); }
  .explainer h2{ font-family:var(--label); font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:var(--gold-deep); }
  .flip{ display:inline-flex; gap:6px; align-items:center; margin-top:8px; font-family:ui-monospace,monospace; font-size:12.5px; }
  .flip .bit{ width:22px; height:22px; display:grid; place-items:center; border:1px solid var(--gold-soft); border-radius:5px; background:#fff; color:var(--ink); }
  .flip .bit.changed{ border-color:var(--bad); color:var(--bad); background:var(--bad-soft); }
  .flip .flip-caption{ font-family:var(--serif); color:var(--bad); }

  footer.foot{ margin-top:40px; padding-top:18px; border-top:1px solid rgba(176,137,47,.28); font-size:12.5px; color:var(--ink-soft); }
  footer.foot a{ color:var(--gold-deep); }

  :focus-visible{ outline:3px solid var(--gold-soft); outline-offset:2px; }
  @keyframes pulse{ 0%,100%{ transform:scale(1); opacity:1; } 50%{ transform:scale(.7); opacity:.55; } }
  @keyframes spin{ to{ transform:rotate(360deg); } }
  @media (prefers-reduced-motion: reduce){
    *{ animation:none !important; transition:none !important; }
    .status.checking .dot{ opacity:1; }
  }
  @media (max-width:560px){ dl.grid{ grid-template-columns:1fr; gap:2px 0; } dl.grid dt{ margin-top:8px; } }
</style>
</head>`;
}

/** The branded 404 page (HTML, not JSON) for an unknown / malformed id. */
export function renderErrorPage(input: { nonce: string; issuer: string }): string {
  const { nonce, issuer } = input;
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
        <p class="eyebrow">Verification</p>
        <h1 class="type-title">Credential not found</h1>
        <div class="status unknown" role="status">
          <span class="dot" aria-hidden="true"></span>
          <span class="txt"><b>UNKNOWN</b><span>No credential matches this link. Check the ID or the QR code on the certificate.</span></span>
        </div>
        <p class="trust trust-spaced">If you scanned a QR code from a printed certificate and reached this page, the
        credential may have been mistyped or may not exist. ${escapeHtml(issuer)} only attests to credentials it has issued.</p>
      </div>
    </main>
    <footer class="foot">${escapeHtml(IDENTITY.trustService)} · ${escapeHtml(IDENTITY.email)}</footer>
  </div>
</body>
</html>`;
}

/** Render the full public credential page for a known record. */
export function renderCredentialPage(input: CredentialPageInput): string {
  const { record, issuer, issuerLegalName, nonce } = input;
  const c = record.content;
  const id = c.credentialId;
  const typeLabel = TYPE_LABEL[c.type];
  const issued = formatIssueDate(c.issueDate);

  // SSR status from the REAL server-computed verdict — correct and
  // court-presentable with JavaScript off. The client script later re-runs the
  // identical check live for the animated ledger; the result is the same.
  const badge = outcomeBadge(input.verification.outcome, issuer);
  const ssrStatusClass = badge.cls;
  const ssrStatusLabel = badge.label;
  const ssrStatusNote = badge.note;

  // Pre-render each check row with its server-computed state, so the ledger is
  // meaningful (and honest) before any script runs.
  const checkRows: Array<{ key: keyof VerificationChecks; label: string }> = [
    { key: 'mldsaSignature', label: 'Post-quantum signature (ML-DSA-65)' },
    { key: 'logInclusion', label: 'Transparency-log inclusion' },
    { key: 'anchorProof', label: 'External anchor (GitHub · OpenTimestamps)' },
    { key: 'notRevoked', label: 'Not revoked by issuer' },
  ];
  const checksHtml = checkRows
    .map((row) => {
      const cls = checkClass(row.key, input.verification.checks[row.key]);
      return `          <li data-check="${row.key}" class="${cls}"><span class="ic" aria-hidden="true"></span><span>${escapeHtml(row.label)}</span></li>`;
    })
    .join('\n');

  const section63Path = `/api/credentials/${encodeURIComponent(id)}/section63`;
  const verifyApiPath = `/api/verify/${encodeURIComponent(id)}`;

  return `${head(nonce, `${typeLabel} certificate · ${c.recipientName} · ${IDENTITY.trustService}`)}
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
        <p class="eyebrow">${escapeHtml(c.kicker)}</p>
        <h1 class="type-title" id="cred-title">${escapeHtml(c.title)}</h1>
        <p class="recipient"><span class="lbl">${escapeHtml(c.intro)}</span>${escapeHtml(c.recipientName)}</p>

        <div class="status ${ssrStatusClass}" id="status" role="status" aria-live="polite" data-ssr-outcome="${escapeHtml(input.verification.outcome)}">
          <span class="dot" aria-hidden="true"></span>
          <span class="txt">
            <b id="status-label">${ssrStatusLabel}</b>
            <span id="status-note">${escapeHtml(ssrStatusNote)}</span>
          </span>
        </div>

        <!-- Verification ledger, pre-rendered with the server-computed verdict so
             it is meaningful without JavaScript. The client re-runs the same
             check live and re-paints these rows for the animated sequence. -->
        <ul class="checks" id="checks" aria-label="Verification checks">
${checksHtml}
        </ul>
      </section>

      <section class="facts" aria-labelledby="facts-h">
        <h2 id="facts-h">Credential details</h2>
        <dl class="grid">
          <dt>Recipient</dt><dd>${escapeHtml(c.recipientName)}</dd>
          <dt>Credential</dt><dd>${escapeHtml(c.kicker)} ${escapeHtml(c.title)}</dd>
          <dt>Type</dt><dd>${escapeHtml(typeLabel)}</dd>
          <dt>Issue date</dt><dd>${escapeHtml(issued)}</dd>
          <dt>Issuer</dt><dd>${escapeHtml(issuer)}</dd>
          <dt>Credential ID</dt><dd><code class="mono">${escapeHtml(id)}</code></dd>
          <dt>Status</dt><dd><span class="pill ${ssrStatusClass}">${ssrStatusLabel}</span></dd>
        </dl>
      </section>

      <section class="trust" aria-label="Trust statement">
        <strong>${escapeHtml(issuerLegalName)}</strong> attests to this credential. The post-quantum
        cryptographic signature proves the attestation is authentic and unaltered, and the entry is
        recorded in a public, tamper-evident transparency log. This is a <strong>self-signed
        cryptographic attestation</strong> by an independent educational initiative; it is <strong>not</strong>
        a licensed certifying-authority Digital Signature Certificate and makes no claim of government
        accreditation. A BSA 2023 §63 certificate of authenticity is available below for legal use.
      </section>

      <div class="actions">
        <a class="btn" href="${section63Path}" id="dl-63">Download §63 certificate of authenticity</a>
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
            <label for="dl-pass">Enter your private download password</label>
            <input id="dl-pass" name="password" type="password" autocomplete="current-password"
                   minlength="1" maxlength="128" required aria-describedby="dl-hint dl-msg">
            <div class="submit-row"><button class="btn primary" type="submit" id="dl-submit">Verify &amp; download PDF</button></div>
            <p class="hint" id="dl-hint">The password was set when the certificate was issued. Anyone holding the
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
          <span class="flip-caption">&nbsp;one flipped bit &rarr; TAMPERED</span>
        </p>
      </section>
    </main>

    <footer class="foot">
      Verified at <a href="${escapeHtml(input.verifyBaseUrl)}">${escapeHtml(input.verifyBaseUrl)}</a> ·
      ${escapeHtml(IDENTITY.trustService)} · ${escapeHtml(IDENTITY.email)} ·
      <span>${escapeHtml(IDENTITY.motto)}</span>
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
    if(!verifyUrl || !statusEl) return;

    var COPY = {
      valid:    { cls:"valid",    label:"VALID",    note:"This credential is authentic, untampered, and recorded in the transparency log." },
      revoked:  { cls:"revoked",  label:"REVOKED",  note:"This credential was issued by us but has since been revoked. It should not be relied upon." },
      tampered: { cls:"bad",      label:"TAMPERED", note:"The verified data does not match what was signed." },
      unknown:  { cls:"unknown",  label:"UNKNOWN",  note:"We could not confirm this credential. Check the ID, or contact the issuer." }
    };

    function setStatus(kind){
      var c = COPY[kind] || COPY.unknown;
      statusEl.className = "status " + c.cls;
      if(labelEl) labelEl.textContent = c.label;
      if(noteEl) noteEl.textContent = c.note;
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
        if(key === "anchorProof" && v === false){ li.classList.add("warn"); }
        else if(v === true){ li.classList.add("pass"); }
        else if(v === false){ li.classList.add("fail"); }
      }
    }

    // Live "quantum-verifying" sequence, then swap in the authoritative result.
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
