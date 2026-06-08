/**
 * Server-rendered admin UI: sign-in, issuance form, credential list.
 *
 * The page is plain HTML/CSS from {@link page} (the shared "Sealed Instrument"
 * design system); the only script is one inline, nonce'd, dependency-free block
 * ({@link adminScript}) that drives the WebAuthn ceremonies through the raw
 * `navigator.credentials` API and posts to the `/api/auth` + `/api/credentials`
 * JSON endpoints. No CDN, no bundler, no third-party code. The page itself ships
 * no secrets; everything sensitive stays server-side behind the session cookie.
 *
 * Register: the ornamental "sealing ceremony" surface. Sign-in / bootstrap is
 * the act of SEALING (passkey); the dashboard is composing a fresh document.
 *
 * Accessibility (WCAG 2.2 AA): semantic landmarks, a skip link (from the
 * layout), labelled inputs, a polite live region for status messages, visible
 * focus, and no meaning conveyed by colour alone (status words accompany the
 * coloured badges).
 */

import { Hono } from 'hono';
import { html } from 'hono/html';

import { getBrandImages } from '@dmjone/render';

import type { IssuerDeps } from '../deps.js';
import type { IssuerHonoEnv } from '../http/context.js';
import { readSession } from '../auth/session.js';
import { isProvisioned } from '../auth/admin-store.js';
import { adminScript } from '../ui/admin-script.js';
import { page } from '../ui/layout.js';

/** The four diamond corner studs that frame an ornamental hero card. */
const STUDS = html`<span class="stud tl" aria-hidden="true"></span><span class="stud tr" aria-hidden="true"></span><span class="stud bl" aria-hidden="true"></span><span class="stud br" aria-hidden="true"></span>`;

/**
 * One editable body paragraph for the live "type-inside-the-render" editor
 * (frozen contract §4.3). The block is a labelled multiline `contenteditable`
 * region defaulting to `pa-justify` (the certificate default, §2.4), with a
 * per-paragraph L/C/R/J alignment control that toggles ONLY the `pa-*` class —
 * never an inline `style` (CSP) — plus a remove control. The admin script
 * (`admin-script.ts`) renders extra blocks with an identical structure via
 * `createElement`, keeps the labels/`aria-pressed` in sync, and serialises the
 * blocks through the trust-boundary serialiser. `index` is 1-based for the
 * accessible name only; it is NOT load-bearing for serialisation. `labelPrefix`
 * names the paragraph for the right surface ("Certificate body" / "Letter body")
 * so both panels read correctly to assistive tech.
 */
function paragraphBlock(index: number, labelPrefix: string): ReturnType<typeof html> {
  return html`<div class="para-block">
  <div class="para-edit pa-justify" contenteditable="true" role="textbox" aria-multiline="true"
    aria-label="${labelPrefix} paragraph ${String(index)}"
    data-placeholder="Body paragraph…"></div>
  <div class="para-tools" role="group" aria-label="Paragraph ${String(index)} alignment">
    <span class="lbl" aria-hidden="true">Align</span>
    <button type="button" class="align-btn" data-align="left" aria-label="Align left" aria-pressed="false">L</button>
    <button type="button" class="align-btn" data-align="center" aria-label="Align center" aria-pressed="false">C</button>
    <button type="button" class="align-btn" data-align="right" aria-label="Align right" aria-pressed="false">R</button>
    <button type="button" class="align-btn" data-align="justify" aria-label="Justify" aria-pressed="true">J</button>
    <button type="button" class="para-rm" data-action="remove-para" aria-label="Remove paragraph ${String(index)}">&times;</button>
  </div>
</div>`;
}

/**
 * The shared rich-body composer surface (frozen contract §4) — the SAME widget
 * the certificate and letterhead panels both instantiate. It is a B/I/U toolbar
 * + one or more editable paragraph blocks (serialised by the shared
 * trust-boundary serialiser, never re-authored). The admin script keys all of
 * its per-editor behaviour (add/remove/relabel/collect/preview) off the
 * `.composer` ancestor + the data-* hints on the `#${editorId}` root, so two
 * instances coexist without singleton collisions.
 *
 * @param editorId       the editor root id (`body-editor` for the cert — kept
 *                       verbatim so the existing tests/handlers find it — and a
 *                       distinct id for the letter).
 * @param labelPrefix    accessible-name prefix for each paragraph + the toolbar.
 * @param maxParas       paragraph cap (cert 6 §4.2; letter up to the schema's 40).
 * @param echo           optional read-only intro/recipient echo above the column
 *                       (the certificate composing aid; omitted for letters).
 * @param previewLabel   the Preview button's visible/aria text.
 */
function composer(opts: {
  editorId: string;
  labelPrefix: string;
  maxParas: number;
  echo?: ReturnType<typeof html>;
  previewLabel: string;
}): ReturnType<typeof html> {
  const toolbarId = `${opts.editorId}-toolbar`;
  return html`<div class="composer" aria-describedby="${opts.editorId}-label">
  <div class="mark-toolbar" role="toolbar" aria-label="Text formatting" aria-controls="${opts.editorId}" id="${toolbarId}">
    <button type="button" class="mark-btn" data-cmd="bold" aria-label="Bold" aria-pressed="false"
      aria-keyshortcuts="Control+B" tabindex="0">B</button>
    <button type="button" class="mark-btn" data-cmd="italic" aria-label="Italic" aria-pressed="false"
      aria-keyshortcuts="Control+I" tabindex="-1"><span class="i">I</span></button>
    <button type="button" class="mark-btn" data-cmd="underline" aria-label="Underline" aria-pressed="false"
      aria-keyshortcuts="Control+U" tabindex="-1"><span class="u">U</span></button>
  </div>
  <div class="canvas">
    ${opts.echo ?? ''}
    <div id="${opts.editorId}" data-label-prefix="${opts.labelPrefix}" data-max-paras="${String(opts.maxParas)}">${paragraphBlock(1, opts.labelPrefix)}</div>
    <div class="body-placeholder" aria-hidden="true">Signature &amp; verification QR appear here</div>
  </div>
  <div class="composer-actions">
    <button type="button" class="secondary" data-action="add-para">+ Add paragraph</button>
    <button type="button" class="secondary" data-action="preview">${opts.previewLabel}</button>
  </div>
  <div id="${opts.editorId}-preview-host" aria-live="polite"></div>
</div>`;
}

export function registerAdminUiRoutes(app: Hono<IssuerHonoEnv>, deps: IssuerDeps): void {
  app.get('/admin', async (c) => {
    const nonce = c.get('cspNonce');
    const session = await readSession(c, deps.env);
    const account = await deps.adminRepo.get().catch(() => null);
    const provisioned = isProvisioned(account);

    const body = session
      ? dashboardBody()
      : signInBody(provisioned);

    return c.html(
      await page({
        title: session ? 'Issuer Admin' : 'Sign in — Issuer Admin',
        role: 'Issuer Admin',
        nonce,
        body,
        script: adminScript(),
      }),
    );
  });
}

/** Sign-in view: passkey login (or first-time bootstrap) + recovery entry. */
function signInBody(provisioned: boolean): ReturnType<typeof html> {
  return html`<h1>${provisioned ? 'Administrator sign-in' : 'First-time setup'}</h1>
<p class="lede">${provisioned
    ? 'Authenticate with a registered passkey to seal and issue credentials.'
    : 'Register the first administrator passkey to bring this issuer to life.'}</p>
<p class="muted" id="status" role="status" aria-live="polite"></p>

${provisioned
    ? html`<div class="card">
  ${STUDS}
  <h2>Seal your session</h2>
  <p>Use a registered passkey (Windows Hello, a phone, or a security key) to sign in.</p>
  <div class="actions">
    <button type="button" data-action="login">Sign in with passkey</button>
  </div>
</div>
<details class="panel">
  <summary>Lost your passkeys? Recover access</summary>
  <div class="inner">
  <p class="muted">Enter a one-time recovery code and your authenticator code, then register a fresh passkey.</p>
  <label for="rc-code">Recovery code</label>
  <input id="rc-code" name="recoveryCode" autocomplete="off" spellcheck="false" />
  <label for="rc-totp">Authenticator code</label>
  <input id="rc-totp" name="token" inputmode="numeric" autocomplete="one-time-code"
    pattern="[0-9]*" maxlength="6" />
  <div class="actions">
    <button type="button" class="secondary" data-action="recover">Recover &amp; register passkey</button>
  </div>
  </div>
</details>`
    : html`<div class="card">
  ${STUDS}
  <h2>Register the administrator passkey</h2>
  <p>No administrator exists yet. Enter the one-time setup token (from your deployment
  secrets) and register the first passkey to bootstrap this issuer. After this, registration
  is locked to authenticated sessions only; the token is required again only after a factory
  reset.</p>
  <label for="setup-token">Setup token</label>
  <input id="setup-token" name="setupToken" type="password" autocomplete="off"
    spellcheck="false" autocapitalize="off" />
  <label for="pk-label">Passkey label</label>
  <input id="pk-label" name="label" value="primary" autocomplete="off" />
  <div class="actions">
    <button type="button" data-action="register">Register administrator passkey</button>
  </div>
</div>`}`;
}

/** The certificate panel — the existing issue form, unchanged except Type is now
 * a free-text input backed by a datalist of the five presets. */
function certificatePanel(): ReturnType<typeof html> {
  const certEcho = html`<div class="body-echo" aria-hidden="true">
          <div class="echo-intro" id="echo-intro">This is to certify that</div>
          <div class="echo-recipient" id="echo-recipient">Recipient name</div>
        </div>`;
  return html`<div class="card">
  ${STUDS}
  <h2>New credential</h2>
  <form id="issue-form">
    <label for="f-type">Type</label>
    <input id="f-type" name="type" list="cert-types" value="internship" maxlength="40"
      autocomplete="off" spellcheck="false" required />
    <datalist id="cert-types">
      <option value="internship"></option>
      <option value="completion"></option>
      <option value="appreciation"></option>
      <option value="experience"></option>
      <option value="participation"></option>
    </datalist>
    <label for="f-recipient">Recipient name</label>
    <input id="f-recipient" name="recipientName" maxlength="120" required />
    <div class="field-row">
      <div class="field-half">
        <label for="f-kicker">Kicker</label>
        <input id="f-kicker" name="kicker" value="Certificate of" maxlength="60" required />
      </div>
      <div class="field-half">
        <label for="f-title">Title</label>
        <input id="f-title" name="title" value="INTERNSHIP" maxlength="60" required />
      </div>
    </div>
    <label for="f-intro">Intro line</label>
    <input id="f-intro" name="intro" value="This is to certify that" maxlength="120" required />

    <span class="card-label" id="body-editor-label">Certificate body</span>
    <p class="muted body-hint">Type the body exactly where it lands on the certificate. Select text and use
    <strong>Bold</strong>, <em>Italic</em>, or <u>Underline</u>, or Ctrl/Cmd+B / I / U. Each paragraph
    carries its own alignment. Up to six paragraphs.</p>
    ${composer({ editorId: 'body-editor', labelPrefix: 'Certificate body', maxParas: 6, echo: certEcho, previewLabel: 'Preview exact PDF' })}

    <label for="f-closing">Closing line (optional)</label>
    <input id="f-closing" name="closingLine" maxlength="200" />
    <div class="field-row">
      <div class="field-half">
        <label for="f-date">Issue date</label>
        <input id="f-date" name="issueDate" type="date" required />
      </div>
      <div class="field-half">
        <label for="f-pw">Candidate download password</label>
        <input id="f-pw" name="password" type="password" minlength="8" maxlength="128" required />
      </div>
    </div>
    <div class="actions">
      <button type="submit">Issue certificate</button>
    </div>
  </form>
</div>`;
}

/** The letterhead panel (Mode 2) — a NEW form reusing the SAME rich body editor.
 * Preview → POST /api/letters/preview; Issue → POST /api/letters. Distinct ids
 * throughout (never reuse the cert's f-* ids). */
function letterheadPanel(): ReturnType<typeof html> {
  return html`<div class="card">
  ${STUDS}
  <h2>New letter</h2>
  <form id="letter-form">
    <label for="lf-reference">Reference (optional)</label>
    <input id="lf-reference" name="reference" maxlength="120" autocomplete="off" />
    <label for="lf-recipient">Recipient lines</label>
    <p class="muted body-hint" id="lf-recipient-hint">One address line per line — name, designation, organisation, etc.</p>
    <textarea id="lf-recipient" name="recipientLines" rows="4"
      aria-describedby="lf-recipient-hint"></textarea>
    <label for="lf-subject">Subject (optional)</label>
    <input id="lf-subject" name="subject" maxlength="160" autocomplete="off" />
    <label for="lf-salutation">Salutation (optional)</label>
    <input id="lf-salutation" name="salutation" maxlength="120" autocomplete="off" />

    <span class="card-label" id="letter-body-editor-label">Letter body</span>
    <p class="muted body-hint">Compose the letter. Select text and use <strong>Bold</strong>,
    <em>Italic</em>, or <u>Underline</u>, or Ctrl/Cmd+B / I / U. Each paragraph carries its own
    alignment; the letter flows across as many pages as it needs.</p>
    ${composer({ editorId: 'letter-body-editor', labelPrefix: 'Letter body', maxParas: 40, previewLabel: 'Preview exact PDF' })}

    <label for="lf-valediction">Valediction (optional)</label>
    <input id="lf-valediction" name="valediction" maxlength="80" autocomplete="off" />
    <div class="field-row">
      <div class="field-half">
        <label for="lf-date">Issue date</label>
        <input id="lf-date" name="issueDate" type="date" required />
      </div>
      <div class="field-half">
        <label for="lf-pw">Candidate download password</label>
        <input id="lf-pw" name="password" type="password" minlength="8" maxlength="128" required />
      </div>
    </div>
    <div class="actions">
      <button type="submit">Issue letter</button>
    </div>
  </form>
</div>`;
}

/** The upload-&-attest panel (Mode 3) — pick a PDF, optionally drag/resize the
 * dmj.one handwritten-signature stamp on a chosen page, then Preview the REAL
 * stamped render and Sign & download the signed PDF. Distinct ids throughout
 * (never the cert `f-*` / letter `lf-*` ids).
 *
 * The placement stage is an aspect-correct scaled rectangle of the selected
 * page; the draggable + resizable signature box inside it carries the SAME brand
 * signature the stamp embeds (so it previews where the mark will land). Box
 * geometry → `SignaturePlacement` fractions (TOP-LEFT origin) in the script.
 * Box/stage SIZE + POSITION are set at runtime via the CSSOM (`element.style.…`,
 * permitted by CSP); no `style=""` attribute is emitted here. */
function uploadPanel(): ReturnType<typeof html> {
  // The exact brand signature image (same mark the stamp embeds), inlined as a
  // data-URI so it loads same-origin with NO network (img-src 'self' data:). The
  // box predicts the stamp by reading this image's natural aspect at runtime.
  const signatureSrc = getBrandImages().signature;
  return html`<div class="card">
  ${STUDS}
  <h2>Upload &amp; attest</h2>
  <p class="muted">Upload a finished PDF; dmj.one stamps a verifiable validation ID (QR) on every
  page, optionally places its handwritten signature where you choose, then seals it with a detached post-quantum signature (ML-DSA-87).
  The document's content stays yours; dmj.one attests only that it signed this exact file.</p>
  <form id="upload-form">
    <label for="upload-file">PDF to attest</label>
    <input id="upload-file" name="file" type="file" accept="application/pdf"
      aria-describedby="upload-meta" />
    <p class="muted upload-meta" id="upload-meta" role="status" aria-live="polite">No file selected.</p>

    <div class="upload-sign-row">
      <input id="upload-place" name="placeHandwrittenSignature" type="checkbox" />
      <label for="upload-place">Place my handwritten signature</label>
    </div>

    <div class="upload-placement" id="upload-placement" hidden>
      <div class="upload-page-row" id="upload-page-row" hidden>
        <label for="upload-page">Signature page</label>
        <select id="upload-page" name="page" aria-describedby="upload-stage-hint"></select>
      </div>
      <p class="muted body-hint" id="upload-stage-hint">Drag the signature to position it; drag the
      corner handle to resize. Or focus it and use the arrow keys to move, Shift+arrows to resize.</p>
      <div class="upload-stage" id="upload-stage">
        <div class="upload-sigbox" id="upload-sigbox" role="application" tabindex="0"
          aria-label="Signature placement: drag to move, arrow keys to nudge, Shift+arrows to resize">
          <img class="upload-sigimg" id="upload-sigimg" src="${signatureSrc}" alt="dmj.one signature"
            draggable="false" />
          <span class="upload-resize" id="upload-resize" aria-hidden="true"></span>
        </div>
      </div>
    </div>

    <label for="upload-pw">Candidate download password</label>
    <input id="upload-pw" name="password" type="password" minlength="8" maxlength="128"
      autocomplete="off" />
    <div class="actions">
      <button type="button" class="secondary" data-action="upload-preview">Preview exact PDF</button>
      <button type="submit">Sign &amp; download</button>
    </div>
  </form>
  <div id="upload-preview-host" aria-live="polite"></div>
</div>`;
}

/** Authenticated dashboard: a 3-mode console (Certificate · Letterhead · Upload)
 * above the always-present issued-list + account-security cards. */
function dashboardBody(): ReturnType<typeof html> {
  return html`<h1>Issue a certificate</h1>
<p class="lede">Compose a fresh credential. Each issuance is signed, logged, and sealed.</p>
<p class="muted" id="status" role="status" aria-live="polite"></p>

<div class="mode-tabs" role="tablist" aria-label="Document mode">
  <button type="button" role="tab" id="tab-certificate" class="mode-tab"
    aria-selected="true" aria-controls="panel-certificate" tabindex="0"
    data-mode-tab="certificate">Certificate</button>
  <button type="button" role="tab" id="tab-letterhead" class="mode-tab"
    aria-selected="false" aria-controls="panel-letterhead" tabindex="-1"
    data-mode-tab="letterhead">Letterhead</button>
  <button type="button" role="tab" id="tab-upload" class="mode-tab"
    aria-selected="false" aria-controls="panel-upload" tabindex="-1"
    data-mode-tab="upload">Upload</button>
</div>

<div id="panel-certificate" class="mode-panel" role="tabpanel" tabindex="0"
  aria-labelledby="tab-certificate">
  ${certificatePanel()}
</div>
<div id="panel-letterhead" class="mode-panel" role="tabpanel" tabindex="0"
  aria-labelledby="tab-letterhead" hidden>
  ${letterheadPanel()}
</div>
<div id="panel-upload" class="mode-panel" role="tabpanel" tabindex="0"
  aria-labelledby="tab-upload" hidden>
  ${uploadPanel()}
</div>

<div class="card">
  ${STUDS}
  <h2>Issued credentials</h2>
  <div class="actions">
    <button type="button" class="secondary" data-action="refresh-list">Refresh list</button>
    <button type="button" class="secondary" data-action="logout">Sign out</button>
  </div>
  <table>
    <thead><tr><th>Credential ID</th><th>Recipient</th><th>Type</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
    <tbody id="cred-rows"><tr><td colspan="5" class="muted">Loading…</td></tr></tbody>
  </table>
</div>

<div class="card">
  ${STUDS}
  <h2>Account security</h2>
  <div class="actions">
    <button type="button" class="secondary" data-action="add-passkey">Add another passkey</button>
    <button type="button" class="secondary" data-action="totp-enroll">Set up authenticator (TOTP)</button>
    <button type="button" class="secondary" data-action="recovery-gen">Generate recovery codes</button>
  </div>
  <div id="security-out" class="muted" aria-live="polite"></div>
</div>`;
}
