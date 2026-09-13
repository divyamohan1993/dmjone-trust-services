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
import { DOC_TEMPLATES, OCI_EMAIL_DAILY_LIMIT, OCI_EMAIL_MONTHLY_LIMIT } from '@dmjone/shared';
import type { AdminAccount, DocumentKind } from '@dmjone/shared';

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

/**
 * The single REQUIRED issuer good-faith attestation (WS1.3): one labelled
 * checkbox + an honest helper line, shared verbatim by the certificate,
 * letterhead, and upload forms (distinct id per surface). The label states the
 * four-part declaration; the helper is honest that this is a good-faith log
 * entry, NOT a legal guarantee. Styling is class-only (reuses `.upload-sign-row`
 * for the checkbox row and `.body-hint`/`.muted` for the helper) so no new CSS,
 * and no inline `style` attribute, is needed (CSP). `required` makes the browser
 * block a bare submit; the admin script ALSO blocks (clear message) and the
 * server schema rejects any issue without `attestation:true`.
 *
 * @param id  the checkbox id + describedby seed (`f-attest` cert / `lf-attest`
 *            letter / `upload-attest` upload), unique per panel.
 */
function attestationRow(id: string): ReturnType<typeof html> {
  const helpId = `${id}-help`;
  // The label + helper are each authored as a SINGLE unbroken line: `html``
  // preserves literal newlines/indentation, so wrapping these sentences would
  // inject whitespace mid-phrase (and break the accessible name + assertions).
  return html`<div class="upload-sign-row">
    <input id="${id}" name="attestation" type="checkbox" required aria-describedby="${helpId}" />
    <label for="${id}">I attest that the facts stated are true and dmj.one had this association, that I am authorised to issue this on dmj.one&#39;s behalf, and that the recipient consents to dmj.one issuing and hosting an independently-verifiable copy.</label>
  </div>
  <p class="muted body-hint" id="${helpId}">This is recorded as a good-faith declaration. It is not a legal guarantee, and a knowingly false document is still forgery.</p>`;
}

/**
 * The "Start from a template" picker for one issue mode (WS1 §Picker): a labelled
 * `<select>` whose options are the {@link DOC_TEMPLATES} entries of the matching
 * `kind`, server-rendered (so it is testable and degrades without JS). A leading
 * empty-value placeholder keeps the form blank until the issuer chooses. The
 * change handler (in the admin script) reads the picked id, looks the content up
 * in the injected catalog, confirms before replacing a non-empty composer, then
 * fills the form. Labels (incl. the convention-extended "(lawyer-review)" suffix)
 * are interpolated, so `html`` auto-escapes them; styling reuses `.upload-page-row`
 * (label + select) so no new CSS / inline style is needed (CSP).
 *
 * @param kind      'certificate' | 'letter', selects which catalog entries show.
 * @param selectId  the `<select>` id (`cert-template` / `letter-template`) + its
 *                  label's `for`; the admin script keys the change handler off it.
 */
function templatePicker(kind: DocumentKind, selectId: string): ReturnType<typeof html> {
  const options = DOC_TEMPLATES.filter((t) => t.kind === kind).map(
    (t) => html`<option value="${t.id}">${t.label}</option>`,
  );
  return html`<div class="upload-page-row">
    <label for="${selectId}">Start from a template</label>
    <select id="${selectId}"><option value="">Blank (start from scratch)</option>${options}</select>
  </div>`;
}

/**
 * The catalog as a JS literal safe to embed INSIDE the nonce'd `<script>`. It is
 * a build-time constant (never user input), but we still neutralise the only
 * sequences that can break out of, or terminate, an inline script: `<` (so no
 * `</script>` can appear) and the U+2028 / U+2029 line separators (legal in JSON
 * strings but illegal raw in a script body). Escaped per-character against the
 * codepoints (0x3c / 0x2028 / 0x2029) so the SOURCE here stays pure ASCII. The
 * admin script embeds the result as `var DOC_TEMPLATES = <json>;`, data
 * injection, not a new script tag or fetch.
 */
const DOC_TEMPLATES_JSON = JSON.stringify(DOC_TEMPLATES)
  .split('')
  .map((ch) => {
    const code = ch.charCodeAt(0);
    return code === 0x3c || code === 0x2028 || code === 0x2029
      ? '\\u' + code.toString(16).padStart(4, '0')
      : ch;
  })
  .join('');

export function registerAdminUiRoutes(app: Hono<IssuerHonoEnv>, deps: IssuerDeps): void {
  app.get('/admin', async (c) => {
    const nonce = c.get('cspNonce');
    const session = await readSession(c, deps.env, deps.adminRepo);
    const account = await deps.adminRepo.get().catch(() => null);
    const provisioned = isProvisioned(account);

    if (session && c.req.query('section') === 'security') return c.redirect('/admin/security');
    const body = session
      ? html`${adminNavigation('documents')}${dashboardBody(!!deps.emailSender, deps.emailSender?.provider === 'oci')}`
      : signInBody(provisioned);

    return c.html(
      await page({
        title: session ? 'Issuer Admin' : 'Sign in — Issuer Admin',
        role: 'Issuer Admin',
        nonce,
        body,
        // The picker change-handler reads the catalog from this injected literal
        // (no extra fetch). Only the authenticated dashboard shows the pickers,
        // but the constant is inert data, so passing it unconditionally is fine.
        script: adminScript(DOC_TEMPLATES_JSON),
      }),
    );
  });

  app.get('/admin/security', async (c) => {
    const session = await readSession(c, deps.env, deps.adminRepo);
    if (!session) return c.redirect('/admin?section=security');
    const account = await deps.adminRepo.get();
    return c.html(await page({
      title: 'Account security — Issuer Admin', role: 'Issuer Admin', nonce: c.get('cspNonce'),
      body: html`${adminNavigation('security')}<h1>Account security</h1>
        <p class="lede">Manage your sign-in keys, authenticator, and recovery codes.</p>
        <p id="status" class="muted" role="status" aria-live="polite"></p>${securityBody(account)}`,
      script: adminScript(),
    }));
  });
}

function adminNavigation(section: 'documents' | 'security'): ReturnType<typeof html> {
  return html`<nav class="admin-nav" aria-label="Administration">
    <a href="/admin" aria-current="${section === 'documents' ? 'page' : 'false'}">Documents</a>
    <a href="/admin/security" aria-current="${section === 'security' ? 'page' : 'false'}">Account security</a>
    <button type="button" class="secondary" data-action="logout">Sign out</button>
  </nav>`;
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
    <button type="button" class="secondary" data-action="login-other">Try another key or device</button>
  </div>
</div>
<details class="panel">
  <summary>Lost your passkeys? Recover access</summary>
  <div class="inner">
  <p class="muted">Enter a one-time recovery code and your authenticator code, then register a fresh passkey.</p>
  <p class="muted">Lost the recovery codes too? Your Google Cloud administrator can replace them through the authenticated recovery procedure. Your existing authenticator is still required.</p>
  <label for="rc-code">Recovery code</label>
  <input id="rc-code" name="recoveryCode" autocomplete="off" spellcheck="false" />
  <label for="rc-totp">Authenticator code</label>
  <input id="rc-totp" name="token" inputmode="numeric" autocomplete="one-time-code"
    pattern="[0-9]*" maxlength="6" />
  <div class="actions">
    <button type="button" class="secondary" data-action="recover">Recover access</button>
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

function emailFields(prefix: string, enabled: boolean): ReturnType<typeof html> {
  return html`<fieldset class="email-fields">
    <legend>Email delivery</legend>
    ${enabled ? html`<label class="email-toggle"><input type="checkbox" id="${prefix}-send-email" name="sendEmail" checked /> Email the recipient after review and scheduling</label>
      <label for="${prefix}-email">Recipient email</label>
      <input id="${prefix}-email" type="email" name="recipientEmail" maxlength="254" autocomplete="off" required />
      <label for="${prefix}-delivery-mode">Delivery time</label>
      <select id="${prefix}-delivery-mode" name="emailDeliveryMode">
        <option value="automatic">Automatic — next working time</option>
        <option value="scheduled">Choose a date and time (IST)</option>
      </select>
      <div data-email-schedule hidden>
        <label for="${prefix}-send-at">Send date and time — IST (Asia/Kolkata)</label>
        <input id="${prefix}-send-at" type="datetime-local" name="emailSendAt" step="60" disabled />
      </div>
      <p class="muted">Monday–Friday, 9 AM–5 PM IST. Before 9 AM: 9 AM that day. Evenings and weekends: 9 AM the next weekday. Times are always IST, wherever you are.</p>
      <p class="muted">Sent from contact@dmj.one with the download link and password. A copy, including any attachments, is sent to records@dmj.one.</p>`
    : html`<p class="muted">Email delivery is awaiting mail service configuration. You can still generate and secure documents.</p>`}
  </fieldset>`;
}

/** The certificate panel — the existing issue form, unchanged except Type is now
 * a free-text input backed by a datalist of the five presets. */
function certificatePanel(emailEnabled: boolean): ReturnType<typeof html> {
  const certEcho = html`<div class="body-echo" aria-hidden="true">
          <div class="echo-intro" id="echo-intro">This is to certify that</div>
          <div class="echo-recipient" id="echo-recipient">Recipient name</div>
        </div>`;
  return html`<div class="card">
  ${STUDS}
  <h2>New credential</h2>
  <form id="issue-form">
    ${templatePicker('certificate', 'cert-template')}
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
        <button type="button" class="secondary" data-action="copy-document-password" data-password-id="f-pw">Copy password</button>
      </div>
    </div>
    ${emailFields('f', emailEnabled)}
    ${attestationRow('f-attest')}
    <div class="actions">
      <button type="button" class="secondary" data-action="save-draft" data-kind="certificate">Save draft</button>
      <button type="submit">Generate certificate</button>
    </div>
  </form>
</div>`;
}

/** The letterhead panel (Mode 2) — a NEW form reusing the SAME rich body editor.
 * Preview → POST /api/letters/preview; Issue → POST /api/letters. Distinct ids
 * throughout (never reuse the cert's f-* ids). */
function letterheadPanel(emailEnabled: boolean): ReturnType<typeof html> {
  return html`<div class="card">
  ${STUDS}
  <h2>New letter</h2>
  <form id="letter-form">
    ${templatePicker('letter', 'letter-template')}
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
        <button type="button" class="secondary" data-action="copy-document-password" data-password-id="lf-pw">Copy password</button>
      </div>
    </div>
    <fieldset class="email-fields">
      <legend>Offer and NDA</legend>
      <label><input type="checkbox" id="lf-offer" name="offerLetter" /> This is an offer letter — include an NDA</label>
      <div id="lf-nda-panel" hidden>
        <p class="muted">Every offer includes an independently signed NDA PDF attached to its email. The applicant must sign every page of both documents, email them to contact@dmj.one, then enroll at timesheet.dmj.one.</p>
        <label for="lf-nda">NDA terms — one paragraph per blank line</label>
        <textarea id="lf-nda" name="ndaBodyParagraphs" rows="16" maxlength="24500"></textarea>
        <p class="muted">Review the confidentiality period and the <a href="https://dmj.one/tos" target="_blank" rel="noopener">Terms &amp; Conditions</a> and <a href="https://dmj.one/privacy" target="_blank" rel="noopener">Privacy Policy</a>. Existing policy wording on submissions and arbitration needs alignment with the engagement. A template does not establish legal compliance.</p>
        <button type="button" class="secondary" data-action="preview-nda">Preview NDA</button>
        <div id="nda-preview-host" aria-live="polite"></div>
      </div>
    </fieldset>
    ${emailFields('lf', emailEnabled)}
    ${attestationRow('lf-attest')}
    <div class="actions">
      <button type="button" class="secondary" data-action="save-draft" data-kind="letter">Save draft</button>
      <button type="submit">Generate letter</button>
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
function uploadPanel(emailEnabled: boolean): ReturnType<typeof html> {
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
      <div class="upload-sign-row">
        <input id="upload-sig-thispage" name="signatureThisPage" type="checkbox" />
        <label for="upload-sig-thispage">Place the signature on this page</label>
      </div>
      <p class="muted upload-sig-summary" id="upload-sig-summary" role="status"
        aria-live="polite"></p>
      <p class="muted body-hint" id="upload-stage-hint">Drag the signature to position it; drag the
      corner handle to resize. Or focus it and use the arrow keys to move, Shift+arrows to resize.
      Each page keeps its own position and size.</p>
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
    ${emailFields('upload', emailEnabled)}
    ${attestationRow('upload-attest')}
    <div class="actions">
      <button type="button" class="secondary" data-action="upload-preview">Preview exact PDF</button>
      <button type="button" class="secondary" data-action="save-draft" data-kind="upload">Save draft</button>
      <button type="submit">Sign &amp; download</button>
    </div>
  </form>
  <div id="upload-preview-host" aria-live="polite"></div>
</div>`;
}

/** Document workspace; account security has its own authenticated page. */
function dashboardBody(emailEnabled: boolean, ociBudget: boolean): ReturnType<typeof html> {
  return html`<h1>Create a document</h1>
<p class="lede">Compose a fresh credential. Each issuance is signed, logged, and sealed.</p>
${ociBudget ? html`<p class="muted">Email sending is capped at ${OCI_EMAIL_DAILY_LIMIT} recipient deliveries per rolling 24 hours and ${OCI_EMAIL_MONTHLY_LIMIT.toLocaleString('en-US')} per UTC calendar month. The records CC counts toward these limits. Document generation continues when the email limit is reached.</p>` : ''}
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
  ${certificatePanel(emailEnabled)}
</div>
<div id="panel-letterhead" class="mode-panel" role="tabpanel" tabindex="0"
  aria-labelledby="tab-letterhead" hidden>
  ${letterheadPanel(emailEnabled)}
</div>
<div id="panel-upload" class="mode-panel" role="tabpanel" tabindex="0"
  aria-labelledby="tab-upload" hidden>
  ${uploadPanel(emailEnabled)}
</div>

<div class="card">
  ${STUDS}
  <h2>Drafts &amp; scheduled delivery</h2>
  <p class="muted">Save a draft, preview it and make your changes. Choose Schedule send after review. Review / edit pauses a scheduled delivery while you work. The final version is signed when delivery starts. Use for another candidate creates an unscheduled copy with new identity fields and a fresh password.</p>
  <div class="actions"><button type="button" class="secondary" data-action="refresh-drafts">Refresh drafts</button></div>
  <div class="issued-table-scroll" role="region" aria-label="Drafts and scheduled documents" tabindex="0">
    <table><thead><tr><th>Document</th><th>Recipient email</th><th>Status</th><th>Send time (IST)</th><th>Actions</th></tr></thead>
    <tbody id="draft-rows"><tr><td colspan="5">Loading…</td></tr></tbody></table>
  </div>
</div>
<div class="card">
  ${STUDS}
  <h2>Issued credentials</h2>
  <div class="actions">
    <button type="button" class="secondary" data-action="refresh-list">Refresh list</button>
  </div>
  <div class="issued-table-scroll" role="region" aria-label="Issued documents" tabindex="0">
  <table>
    <thead><tr><th>Credential ID</th><th>Recipient</th><th>Type</th><th>Status</th><th>Email delivery</th><th><span class="sr-only">Actions</span></th></tr></thead>
    <tbody id="cred-rows"><tr><td colspan="6" class="muted">Loading…</td></tr></tbody>
  </table>
  </div>
</div>

`;
}

function securityBody(account: AdminAccount | null): ReturnType<typeof html> {
  return html`<div class="card" id="account-security">
  ${STUDS}
  <h2>Sign-in and recovery</h2>
  <p><span id="passkey-count">${account?.webauthnCredentials.length ?? 0} registered passkeys</span> · ${account?.recoveryCodeHashes.length ?? 0} recovery codes remaining · Authenticator ${account?.totpSecretEnc ? 'active' : 'not confirmed'}</p>
  <p>Keep at least two working passkeys on separate devices. After recovery, add a new passkey here and test it in a separate browser session before signing out. Save recovery codes somewhere you can reach if your phone is lost.</p>
  <h3>Passkeys and security keys</h3>
  <p id="passkey-status" class="muted" role="status" aria-live="polite">Loading your registered keys…</p>
  <ul id="passkey-list" class="passkey-list" aria-label="Registered passkeys and security keys"></ul>
  <p id="passkey-session-note" class="muted"></p>
  <form id="passkey-add-form" class="passkey-add">
    <label for="new-passkey-label">Name your new key</label>
    <input id="new-passkey-label" name="label" maxlength="80" required placeholder="e.g. My phone or backup USB key" autocomplete="off" />
    <button type="submit" data-action="add-passkey">Add a passkey or security key</button>
  </form>
  <dialog id="passkey-rename-dialog" class="key-dialog" aria-labelledby="passkey-rename-title">
    <form id="passkey-rename-form">
      <h3 id="passkey-rename-title">Rename key</h3>
      <label for="passkey-rename-label">Key name</label>
      <input id="passkey-rename-label" maxlength="80" required autocomplete="off" />
      <p id="passkey-rename-error" class="muted" role="alert"></p>
      <div class="actions"><button type="button" class="secondary" data-action="key-dialog-cancel">Cancel</button><button type="submit">Save name</button></div>
    </form>
  </dialog>
  <dialog id="passkey-remove-dialog" class="key-dialog" aria-labelledby="passkey-remove-title">
    <form id="passkey-remove-form">
      <h3 id="passkey-remove-title">Remove key?</h3>
      <p id="passkey-remove-description"></p>
      <p>This removes the key from your dmj.one account. It does not delete the saved passkey from your device or password manager.</p>
      <p id="passkey-remove-error" class="muted" role="alert"></p>
      <div class="actions"><button type="button" class="secondary" data-action="key-dialog-cancel">Cancel</button><button type="submit" class="danger">Remove key</button></div>
    </form>
  </dialog>
  <h3>Authenticator and recovery</h3>
  <div class="actions">
    <button type="button" class="secondary" data-action="totp-enroll">Set up authenticator (TOTP)</button>
    <button type="button" class="secondary" data-action="recovery-gen">Generate recovery codes</button>
  </div>
  <div id="security-out" class="muted" aria-live="polite"></div>
</div>`;
}
