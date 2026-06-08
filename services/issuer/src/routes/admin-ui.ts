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
 * (`admin-script.ts`) renders blocks 2–6 with an identical structure via
 * `createElement`, keeps the labels/`aria-pressed` in sync, and serialises the
 * blocks through the trust-boundary serialiser. `index` is 1-based for the
 * accessible name only; it is NOT load-bearing for serialisation.
 */
function paragraphBlock(index: number): ReturnType<typeof html> {
  return html`<div class="para-block">
  <div class="para-edit pa-justify" contenteditable="true" role="textbox" aria-multiline="true"
    aria-label="Certificate body paragraph ${String(index)}"
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

/** Authenticated dashboard: register more passkeys, set up TOTP/recovery, issue, list. */
function dashboardBody(): ReturnType<typeof html> {
  return html`<h1>Issue a certificate</h1>
<p class="lede">Compose a fresh credential. Each issuance is signed, logged, and sealed.</p>
<p class="muted" id="status" role="status" aria-live="polite"></p>

<div class="card">
  ${STUDS}
  <h2>New credential</h2>
  <form id="issue-form">
    <label for="f-type">Type</label>
    <select id="f-type" name="type">
      <option value="internship">Internship</option>
      <option value="completion">Completion</option>
      <option value="appreciation">Appreciation</option>
      <option value="experience">Experience</option>
      <option value="participation">Participation</option>
    </select>
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

    <span class="card-label" id="body-label">Certificate body</span>
    <p class="muted body-hint">Type the body exactly where it lands on the certificate. Select text and use
    <strong>Bold</strong>, <em>Italic</em>, or <u>Underline</u>, or Ctrl/Cmd+B / I / U. Each paragraph
    carries its own alignment. Up to six paragraphs.</p>
    <div class="composer" aria-describedby="body-label">
      <div class="mark-toolbar" role="toolbar" aria-label="Text formatting" aria-controls="body-editor">
        <button type="button" class="mark-btn" data-cmd="bold" aria-label="Bold" aria-pressed="false"
          aria-keyshortcuts="Control+B" tabindex="0">B</button>
        <button type="button" class="mark-btn" data-cmd="italic" aria-label="Italic" aria-pressed="false"
          aria-keyshortcuts="Control+I" tabindex="-1"><span class="i">I</span></button>
        <button type="button" class="mark-btn" data-cmd="underline" aria-label="Underline" aria-pressed="false"
          aria-keyshortcuts="Control+U" tabindex="-1"><span class="u">U</span></button>
      </div>
      <div class="canvas">
        <div class="body-echo" aria-hidden="true">
          <div class="echo-intro" id="echo-intro">This is to certify that</div>
          <div class="echo-recipient" id="echo-recipient">Recipient name</div>
        </div>
        <div id="body-editor">${paragraphBlock(1)}</div>
        <div class="body-placeholder" aria-hidden="true">Signature &amp; verification QR appear here</div>
      </div>
      <div class="composer-actions">
        <button type="button" class="secondary" data-action="add-para">+ Add paragraph</button>
        <button type="button" class="secondary" data-action="preview">Preview exact PDF</button>
      </div>
      <div id="preview-host" aria-live="polite"></div>
    </div>

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
  <pre id="security-out" class="muted" aria-live="polite"></pre>
</div>`;
}
