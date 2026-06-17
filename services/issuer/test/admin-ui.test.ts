import { describe, expect, it } from 'vitest';

import { DOC_TEMPLATES } from '@dmjone/shared';

import { createIssuerApp } from '../src/app.js';
import { adminScript } from '../src/ui/admin-script.js';
import { serializeBlock, serializeBody, type SNode } from '../src/ui/serialize-body.js';
import { buildDeps } from './fakes.js';
import { mintSessionCookie } from './session-helper.js';

describe('GET / (bare domain)', () => {
  it('redirects to /admin instead of a raw 404', async () => {
    const app = createIssuerApp(buildDeps());
    const res = await app.request('/');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/admin');
  });
});

describe('GET /admin (server-rendered, no CDN)', () => {
  it('renders the first-time setup view when unprovisioned + unauthenticated', async () => {
    const app = createIssuerApp(buildDeps());
    const res = await app.request('/admin');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('First-time setup');
    expect(body).toContain('data-action="register"');
    // No third-party origins: the only script is inline + nonce'd.
    expect(body).not.toContain('http://');
    expect(body).not.toMatch(/src=["']https?:\/\//);
    // Inline script carries the per-request CSP nonce.
    const csp = res.headers.get('content-security-policy') ?? '';
    const nonceMatch = csp.match(/'nonce-([a-f0-9]+)'/);
    expect(nonceMatch).not.toBeNull();
    expect(body).toContain(`<script nonce="${nonceMatch?.[1]}">`);
  });

  it('renders the login view when provisioned + unauthenticated', async () => {
    const deps = buildDeps();
    deps.adminRepo.account = {
      id: 'admin',
      webauthnCredentials: [
        { credentialId: 'c', publicKey: 'k', counter: 0, label: 'l', createdAt: 'now' },
      ],
      recoveryCodeHashes: [],
      failureCount: 0,
      createdAt: 'now',
      updatedAt: 'now',
    };
    const app = createIssuerApp(deps);
    const body = await (await app.request('/admin')).text();
    expect(body).toContain('Administrator sign-in');
    expect(body).toContain('data-action="login"');
    expect(body).toContain('data-action="recover"');
  });

  it('renders the issuance dashboard when authenticated', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);
    const res = await app.request('/admin', { headers: { cookie } });
    const body = await res.text();
    expect(body).toContain('Issue a certificate');
    expect(body).toContain('id="issue-form"');
    expect(body).toContain('Issued credentials');
    // The recipient-name input the issuance form posts.
    expect(body).toContain('name="recipientName"');
  });
});

// ---------------------------------------------------------------------------
// The live body editor markup (frozen contract §4): the textarea is replaced by
// the "type-inside-the-render" composing surface — an editable body column with
// paragraph blocks, a shared B/I/U toolbar, and per-paragraph alignment
// controls — all CSP-clean (no inline handlers, nonce'd script) and labelled
// for WCAG 2.2 AA.
// ---------------------------------------------------------------------------
describe('GET /admin — live body editor surface (§4)', () => {
  async function dashboardHtml(): Promise<string> {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);
    return (await app.request('/admin', { headers: { cookie } })).text();
  }

  it('replaces the #f-body textarea with the body-composing editor', async () => {
    const body = await dashboardHtml();
    // The old free-text CERTIFICATE-BODY textarea is GONE (the editor is the only
    // body input now). NB: the letterhead panel legitimately has a recipient-lines
    // <textarea>, so the assertion is the specific old id, not a blanket textarea
    // ban — the cert body is the contenteditable editor below.
    expect(body).not.toContain('id="f-body"');
    expect(body).not.toContain('name="bodyParagraphs"'); // body never rides a form field
    // A faithful composing surface exists with at least one editable paragraph.
    expect(body).toContain('id="body-editor"');
    expect(body).toContain('contenteditable="true"');
    // A live read-only echo of intro + recipient sits ABOVE the body column, and
    // a signature/QR placeholder BELOW (so the admin sees where text lands).
    expect(body).toContain('body-echo');
    expect(body).toContain('body-placeholder');
  });

  it('exposes a labelled B/I/U toolbar as an accessible toolbar widget', async () => {
    const body = await dashboardHtml();
    expect(body).toContain('role="toolbar"');
    // Bold / Italic / Underline each declared with an accessible name + pressed state.
    expect(body).toContain('data-cmd="bold"');
    expect(body).toContain('data-cmd="italic"');
    expect(body).toContain('data-cmd="underline"');
    expect(body).toMatch(/data-cmd="bold"[^>]*aria-pressed="false"/);
    expect(body).toMatch(/data-cmd="bold"[^>]*aria-label="Bold"/);
    expect(body).toMatch(/data-cmd="italic"[^>]*aria-label="Italic"/);
    expect(body).toMatch(/data-cmd="underline"[^>]*aria-label="Underline"/);
  });

  it('renders labelled per-paragraph alignment controls (L/C/R/J) with pressed state', async () => {
    const body = await dashboardHtml();
    for (const a of ['left', 'center', 'right', 'justify']) {
      expect(body).toContain(`data-align="${a}"`);
      expect(body).toMatch(new RegExp(`data-align="${a}"[^>]*aria-label="`));
    }
    // Alignment buttons reflect selection via aria-pressed; default is justify.
    expect(body).toMatch(/data-align="justify"[^>]*aria-pressed="true"/);
    expect(body).toMatch(/data-align="left"[^>]*aria-pressed="false"/);
    // Each editable paragraph is a labelled multiline region.
    expect(body).toContain('aria-multiline="true"');
    expect(body).toMatch(/aria-label="Certificate body paragraph/);
  });

  it('wires add/remove-paragraph and preview controls via data-action (no inline handlers)', async () => {
    const body = await dashboardHtml();
    expect(body).toContain('data-action="add-para"');
    expect(body).toContain('data-action="remove-para"');
    expect(body).toContain('data-action="preview"');
    // No inline event handler attributes anywhere (CSP-clean).
    expect(body).not.toMatch(/\son[a-z]+=/);
  });

  it('keeps the body editor styling class-based — no inline style attributes (CSP)', async () => {
    const body = await dashboardHtml();
    // No inline style="" ATTRIBUTE may appear on any element (CSP forbids it).
    // Match `style=` only inside an open tag (`<tag ... style=`); the negated
    // `[^>]` stops at the first `>`, so the design-system <style> block's CSS
    // comments (which mention `style=""` descriptively) can never match.
    expect(body).not.toMatch(/<[a-z][^>]*\sstyle=/i);
    // And the editor surface itself is present (so the assertion has teeth).
    expect(body).toContain('id="body-editor"');
  });

  it('inlines the admin script under the per-request nonce (and only there)', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);
    const res = await app.request('/admin', { headers: { cookie } });
    const body = await res.text();
    const csp = res.headers.get('content-security-policy') ?? '';
    const nonce = csp.match(/'nonce-([a-f0-9]+)'/)?.[1];
    expect(nonce).toBeTruthy();
    // Exactly the nonce'd script tags (style + script) carry the nonce; there is
    // no un-nonced <script> in the document.
    expect(body).toContain(`<script nonce="${nonce}">`);
    expect(body).not.toMatch(/<script(?![^>]*\bnonce=)/);
  });
});

describe('adminScript() — still a dependency-free nonce-ready IIFE', () => {
  it('ships the serializer source and the WebAuthn ceremonies in one IIFE', () => {
    const src = adminScript();
    // Self-contained IIFE wrapper preserved.
    expect(src.startsWith('(function(){')).toBe(true);
    expect(src.trimEnd().endsWith('})();')).toBe(true);
    // No backticks (authored as a concatenated string per the file's contract).
    expect(src).not.toContain('`');
    // WebAuthn ceremonies remain intact (behavioural superset).
    expect(src).toContain('navigator.credentials.create');
    expect(src).toContain('navigator.credentials.get');
    expect(src).toContain('/api/auth/register/options');
    expect(src).toContain('/api/auth/login/verify');
    // The TRUST-BOUNDARY serializer is shipped verbatim (single source of truth):
    // the exact function bodies tested here are embedded for the browser to run.
    expect(src).toContain(serializeBlock.toString());
    expect(src).toContain(serializeBody.toString());
    // Preview posts to the §5.1 endpoint with the §5.4 fetch shape.
    expect(src).toContain('/api/credentials/preview');
    expect(src).toContain('createObjectURL');
    expect(src).toContain('revokeObjectURL');
  });

  it('routes the body through the serializer — the dead textarea read is gone', () => {
    const src = adminScript();
    // Once #f-body is removed, FormData carries no body; both issue() and
    // preview() must build bodyParagraphs via serializeBody, never re-read the
    // old textarea field.
    expect(src).not.toContain("data.get('bodyParagraphs')");
    expect(src).toContain('bodyParagraphs: collectBody()');
  });

  it('applies marks CSP-safely: styleWithCSS=false + selection-preserving mousedown', () => {
    const src = adminScript();
    // execCommand must emit <b>/<i>/<u> tags (not style spans the serializer
    // would unwrap), and the toolbar must act on mousedown+preventDefault so it
    // never steals focus from the editable (which would void the selection).
    expect(src).toContain("execCommand('styleWithCSS', false, 'false')");
    expect(src).toContain("addEventListener('mousedown'");
    // Live aria-pressed sync + paste-as-plaintext + roving tabindex are wired.
    expect(src).toContain("addEventListener('selectionchange'");
    expect(src).toContain("addEventListener('paste'");
    expect(src).toContain('queryCommandState');
    // Alignment is class-only — the body editor never assigns inline geometry to a
    // DOM node. (The Mode-3 placement box DOES use CSSOM left/top/width/height for
    // drag; that is permitted by CSP — only HTML style="" ATTRIBUTES are blocked —
    // and is asserted to stay within that allowlist by the dedicated test below.)
    expect(src).not.toMatch(/\.style\.(?!left|top|width|height)[a-zA-Z]/);
    expect(src).not.toContain('execCommand(\'justify');
  });
});

describe('layout — editor CSS fidelity + CSP (§2.4, §4.1)', () => {
  async function dashboardHtml(): Promise<string> {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);
    return (await app.request('/admin', { headers: { cookie } })).text();
  }

  it('ships the four pa-* alignment classes in the live-editor stylesheet (§2.4)', async () => {
    const body = await dashboardHtml();
    expect(body).toMatch(/\.pa-left\{text-align:left\}/);
    expect(body).toMatch(/\.pa-center\{text-align:center\}/);
    expect(body).toMatch(/\.pa-right\{text-align:right\}/);
    expect(body).toMatch(/\.pa-justify\{text-align:justify;text-justify:inter-word\}/);
  });

  it('mirrors the certificate body typography on the editable column (§4.1)', async () => {
    const body = await dashboardHtml();
    // The editable paragraph uses var(--serif)/11.5pt/1.62 over the cert column
    // width, default justify — sourced from template.ts so the preview matches.
    expect(body).toMatch(/\.para-edit\{font-family:var\(--serif\);font-size:11\.5pt;line-height:1\.62/);
    expect(body).toContain('#body-editor{max-width:152mm');
    // prefers-reduced-motion is respected (WCAG 2.2 AA).
    expect(body).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

// ---------------------------------------------------------------------------
// The 3-mode console (frozen contract §E): a role=tablist mode switcher above
// three panels (Certificate · Letterhead · Upload). The certificate panel is the
// existing issue form (Type now a free-text input + preset datalist); the
// letterhead panel is a new form reusing the SHARED rich body editor; the upload
// panel is an empty container with a placeholder (built by the next stream). All
// CSP-clean: tablist roving via aria-selected/tabindex, panels toggle via the
// [hidden] boolean attribute, and NO inline style="" attribute anywhere.
// ---------------------------------------------------------------------------
describe('GET /admin — 3-mode console shell (§E)', () => {
  async function dashboardHtml(): Promise<string> {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);
    return (await app.request('/admin', { headers: { cookie } })).text();
  }

  it('renders a role=tablist mode switcher with three roving tabs', async () => {
    const body = await dashboardHtml();
    expect(body).toContain('role="tablist"');
    // Three tabs, each labelled + wired to its panel via aria-controls.
    expect(body).toMatch(/role="tab"[^>]*aria-controls="panel-certificate"/);
    expect(body).toMatch(/role="tab"[^>]*aria-controls="panel-letterhead"/);
    expect(body).toMatch(/role="tab"[^>]*aria-controls="panel-upload"/);
    expect(body).toContain('>Certificate</button>');
    expect(body).toContain('>Letterhead</button>');
    expect(body).toContain('>Upload</button>');
    // Default tab = Certificate (selected + tabbable); the others are roved out.
    expect(body).toMatch(/id="tab-certificate"[^>]*aria-selected="true"/);
    expect(body).toMatch(/id="tab-certificate"[^>]*tabindex="0"/);
    expect(body).toMatch(/id="tab-letterhead"[^>]*aria-selected="false"/);
    expect(body).toMatch(/id="tab-letterhead"[^>]*tabindex="-1"/);
  });

  it('renders three tabpanels, only the certificate panel visible by default', async () => {
    const body = await dashboardHtml();
    expect(body).toMatch(/id="panel-certificate"[^>]*role="tabpanel"/);
    expect(body).toMatch(/id="panel-letterhead"[^>]*role="tabpanel"/);
    expect(body).toMatch(/id="panel-upload"[^>]*role="tabpanel"/);
    // The two non-default panels start hidden (the [hidden] boolean attr — CSP-clean).
    expect(body).toMatch(/id="panel-letterhead"[^>]*\shidden/);
    expect(body).toMatch(/id="panel-upload"[^>]*\shidden/);
    // The certificate panel is NOT hidden (carries the existing issue form).
    expect(body).not.toMatch(/id="panel-certificate"[^>]*\shidden/);
    // The certificate panel still hosts the existing issue form + recipient input.
    expect(body).toMatch(/id="panel-certificate"[\s\S]*id="issue-form"/);
    expect(body).toContain('name="recipientName"');
  });

  it('fills the Upload panel with the upload→stamp→sign flow (file, toggle, stage, actions)', async () => {
    const body = await dashboardHtml();
    // The placeholder copy is GONE; the panel now hosts the upload form.
    expect(body).not.toMatch(/coming in the next step/i);
    expect(body).toMatch(/id="panel-upload"[\s\S]*id="upload-form"/);
    // A labelled PDF file input (accept=application/pdf) — the upload entry point.
    expect(body).toMatch(/<input[^>]*id="upload-file"[^>]*type="file"/);
    expect(body).toMatch(/<input[^>]*id="upload-file"[^>]*accept="application\/pdf"/);
    expect(body).toMatch(/<label[^>]*for="upload-file"/);
    // The "Place my handwritten signature" toggle (a labelled checkbox, default off).
    expect(body).toMatch(/<input[^>]*id="upload-place"[^>]*type="checkbox"/);
    expect(body).not.toMatch(/id="upload-place"[^>]*checked/);
    expect(body).toMatch(/<label[^>]*for="upload-place"/);
    // The placement stage + the draggable/resizable signature box (with the brand
    // signature image and a resize handle) — keyboard-operable + labelled.
    expect(body).toContain('id="upload-stage"');
    // The stage must NOT be aria-hidden: it holds the focusable, aria-labelled box,
    // and a focusable node inside an aria-hidden subtree is the aria-hidden-focus
    // violation (the box's label would be dead to AT while still keyboard-focusable).
    expect(body).not.toMatch(/id="upload-stage"[^>]*aria-hidden/);
    expect(body).toMatch(/id="upload-sigbox"[^>]*tabindex="0"/);
    expect(body).toMatch(/id="upload-sigbox"[^>]*aria-label="/);
    expect(body).toMatch(/<img[^>]*id="upload-sigimg"[^>]*alt="/);
    expect(body).toContain('id="upload-resize"');
    // A labelled download-password field (gates the signed PDF).
    expect(body).toMatch(/<input[^>]*id="upload-pw"[^>]*type="password"/);
    expect(body).toMatch(/<label[^>]*for="upload-pw"/);
    // Preview (data-action) + Sign & download (submit) actions, distinct ids from
    // the cert/letter panels (never an f-* / lf-* id reused).
    expect(body).toContain('data-action="upload-preview"');
    expect(body).toMatch(/<button[^>]*type="submit"[^>]*>Sign &amp; download<\/button>|>Sign &amp; download<\/button>/);
    expect(body).not.toContain('id="f-file"');
    // A blob-iframe preview host mirrors the cert/letter *-preview-host divs.
    expect(body).toContain('id="upload-preview-host"');
  });

  it('makes the certificate Type a free-text input backed by a preset datalist', async () => {
    const body = await dashboardHtml();
    // Type is now an <input list="cert-types"> (free text), NOT a <select>.
    expect(body).toMatch(/<input[^>]*id="f-type"[^>]*list="cert-types"/);
    expect(body).toMatch(/<input[^>]*id="f-type"[^>]*name="type"/);
    expect(body).not.toMatch(/<select[^>]*id="f-type"/);
    // The datalist offers all five presets.
    expect(body).toContain('<datalist id="cert-types">');
    for (const preset of [
      'internship',
      'completion',
      'appreciation',
      'experience',
      'participation',
    ]) {
      expect(body).toContain(`<option value="${preset}">`);
    }
  });

  it('renders the letterhead panel fields, each labelled (WCAG 2.2 AA)', async () => {
    const body = await dashboardHtml();
    // The letterhead form + its distinct field ids (never the cert f-* ids).
    expect(body).toContain('id="letter-form"');
    const fields: Array<[string, string]> = [
      ['lf-reference', 'reference'],
      ['lf-recipient', 'recipientLines'],
      ['lf-subject', 'subject'],
      ['lf-salutation', 'salutation'],
      ['lf-valediction', 'valediction'],
      ['lf-date', 'issueDate'],
      ['lf-pw', 'password'],
    ];
    for (const [id, name] of fields) {
      // Each control carries its field name and a programmatically-associated label.
      expect(body).toMatch(new RegExp(`(id|name)="${id}"[^>]*name="${name}"|name="${name}"[^>]*id="${id}"`));
      expect(body).toMatch(new RegExp(`<label[^>]*for="${id}"`));
    }
    // Recipient lines is a multi-line textarea (one address line per line).
    expect(body).toMatch(/<textarea[^>]*id="lf-recipient"/);
    // The letterhead panel reuses the SHARED rich body editor (distinct id).
    expect(body).toContain('id="letter-body-editor"');
    expect(body).toMatch(/<button[^>]*type="submit"[^>]*>Issue letter<\/button>|>Issue letter<\/button>/);
  });

  it('renders NO inline style="" attribute anywhere in the admin HTML (CSP)', async () => {
    const body = await dashboardHtml();
    // CSP forbids inline style attributes. Match `style=` only inside an open tag
    // (the negated [^>] stops at the first >, so the design-system <style> block's
    // CSS comments that mention style="" descriptively can never match).
    expect(body).not.toMatch(/<[a-z][^>]*\sstyle=/i);
  });
});

// ---------------------------------------------------------------------------
// Issuer good-faith attestation (WS1.3): a SINGLE required checkbox on EACH of
// the three issue surfaces (certificate, letterhead, upload). The label states
// the four-part declaration (facts true · had the association · authorised to
// issue · recipient consents to hosting a verifiable copy); the helper text is
// honest about what it is (a good-faith log entry, NOT a legal guarantee, and a
// knowingly false document is still forgery). Each is a labelled, required
// checkbox with a distinct id (cert / letter / upload) — CSP-clean, no inline
// handler. The substrings asserted avoid apostrophes (static html`` text is not
// auto-escaped today, but a future interpolation refactor WOULD escape `'` to
// `&#39;`; apostrophe-free anchors keep this test honest either way).
// ---------------------------------------------------------------------------
describe('GET /admin — issuer attestation checkbox (WS1.3)', () => {
  async function dashboardHtml(): Promise<string> {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);
    return (await app.request('/admin', { headers: { cookie } })).text();
  }

  it('puts a required, labelled attestation checkbox on the certificate form', async () => {
    const body = await dashboardHtml();
    // A required checkbox with a distinct id inside the certificate panel/form.
    expect(body).toMatch(/<input[^>]*id="f-attest"[^>]*type="checkbox"/);
    expect(body).toMatch(/<input[^>]*id="f-attest"[^>]*required/);
    expect(body).toMatch(/<label[^>]*for="f-attest"/);
    expect(body).toMatch(/id="panel-certificate"[\s\S]*id="f-attest"/);
  });

  it('puts a required, labelled attestation checkbox on the letterhead form', async () => {
    const body = await dashboardHtml();
    expect(body).toMatch(/<input[^>]*id="lf-attest"[^>]*type="checkbox"/);
    expect(body).toMatch(/<input[^>]*id="lf-attest"[^>]*required/);
    expect(body).toMatch(/<label[^>]*for="lf-attest"/);
    expect(body).toMatch(/id="panel-letterhead"[\s\S]*id="lf-attest"/);
  });

  it('puts a required, labelled attestation checkbox on the upload form', async () => {
    const body = await dashboardHtml();
    expect(body).toMatch(/<input[^>]*id="upload-attest"[^>]*type="checkbox"/);
    expect(body).toMatch(/<input[^>]*id="upload-attest"[^>]*required/);
    expect(body).toMatch(/<label[^>]*for="upload-attest"/);
    expect(body).toMatch(/id="panel-upload"[\s\S]*id="upload-attest"/);
  });

  it('states the four-part declaration + the honest "not a guarantee" helper text', async () => {
    const body = await dashboardHtml();
    // The declaration wording (apostrophe-free anchors so escaping can't break it).
    expect(body).toContain('the facts stated are true');
    expect(body).toContain('had this association');
    expect(body).toContain('authorised to issue this');
    expect(body).toContain('independently-verifiable copy');
    // The honest framing: a good-faith declaration, not a legal guarantee.
    expect(body).toContain('good-faith declaration');
    expect(body).toContain('knowingly false document is still forgery');
  });

  it('keeps the attestation rows class-based — still NO inline style="" attribute (CSP)', async () => {
    const body = await dashboardHtml();
    expect(body).not.toMatch(/<[a-z][^>]*\sstyle=/i);
    // No inline event handler attributes introduced with the new controls.
    expect(body).not.toMatch(/\son[a-z]+=/);
  });
});

describe('adminScript() — issuer attestation wiring (WS1.3)', () => {
  it('sends attestation:true ONLY on issuance (never on preview), gated on the box', () => {
    const src = adminScript();
    // Issue payloads carry the literal attestation flag; preview payloads do NOT.
    expect(src).toContain('payload.attestation = true');
    // The flag is coupled to wantPassword (issue), exactly like the password —
    // preview omits both. So the only attestation assignment sits under that gate.
    expect(src).toMatch(/if\(wantPassword\)\{[\s\S]*payload\.attestation = true/);
    // Each issue surface gates on ITS OWN required checkbox id (cert/letter/upload).
    expect(src).toContain("attestChecked('f-attest')");
    expect(src).toContain("attestChecked('lf-attest')");
    expect(src).toContain("attestChecked('upload-attest')");
    // The upload sign path (no buildPayload) sets attestation on its own JSON body.
    expect(src).toMatch(/attestation: true[\s\S]*signaturePlacements|placeHandwrittenSignature[\s\S]*attestation: true/);
  });

  it('blocks an unattested issuance client-side with a clear status message', () => {
    const src = adminScript();
    // The submit handlers refuse to POST when the box is unchecked (the server
    // also rejects; this is the friendly first line of defence).
    expect(src).toContain('attestChecked');
    // The block path surfaces a clear message and returns BEFORE the POST.
    expect(src).toMatch(/if\(!attestChecked\([^)]*\)\)\{ setStatus\(/);
  });
});

// ---------------------------------------------------------------------------
// Document-template picker (WS1 §Picker): a "Start from a template" <select> in
// the certificate panel (kind='certificate' entries) and the letterhead panel
// (kind='letter' entries). Options are SERVER-RENDERED from DOC_TEMPLATES
// (testable + degrades without JS); the full catalog content is injected ONCE
// into the existing nonce'd admin script (no new fetch, no inline script) for the
// change handler's id→content lookup. Convention-extended labels keep their
// "(lawyer-review)" suffix verbatim. CSP-clean: labelled <select>, no inline
// handler, the change is wired by the delegated admin script.
// ---------------------------------------------------------------------------
describe('GET /admin — document-template picker (WS1)', () => {
  async function dashboardHtml(): Promise<string> {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);
    return (await app.request('/admin', { headers: { cookie } })).text();
  }

  const certTemplates = DOC_TEMPLATES.filter((t) => t.kind === 'certificate');
  const letterTemplates = DOC_TEMPLATES.filter((t) => t.kind === 'letter');

  it('renders a labelled certificate-template <select> inside the certificate panel', async () => {
    const body = await dashboardHtml();
    expect(body).toMatch(/<select[^>]*id="cert-template"/);
    expect(body).toMatch(/<label[^>]*for="cert-template"/);
    expect(body).toMatch(/id="panel-certificate"[\s\S]*id="cert-template"/);
    // A non-selecting placeholder leads the list (empty value).
    expect(body).toMatch(/<select[^>]*id="cert-template"[^>]*>\s*<option value="">/);
  });

  it('renders a labelled letter-template <select> inside the letterhead panel', async () => {
    const body = await dashboardHtml();
    expect(body).toMatch(/<select[^>]*id="letter-template"/);
    expect(body).toMatch(/<label[^>]*for="letter-template"/);
    expect(body).toMatch(/id="panel-letterhead"[\s\S]*id="letter-template"/);
    expect(body).toMatch(/<select[^>]*id="letter-template"[^>]*>\s*<option value="">/);
  });

  // The inner HTML of a specific <select id="…"> … </select> region — so the
  // cross-kind isolation check is scoped to ONE picker, not the whole document
  // (the OTHER picker, and the catalog JSON injected into the admin script, both
  // legitimately mention every id elsewhere on the page).
  function selectRegion(body: string, selectId: string): string {
    const open = body.indexOf(`<select id="${selectId}"`);
    expect(open).toBeGreaterThanOrEqual(0);
    const end = body.indexOf('</select>', open);
    expect(end).toBeGreaterThan(open);
    return body.slice(open, end);
  }

  it('offers exactly the certificate-kind templates as cert options (id + label)', async () => {
    const body = await dashboardHtml();
    expect(certTemplates.length).toBeGreaterThan(0);
    const region = selectRegion(body, 'cert-template');
    for (const t of certTemplates) {
      // Each cert template is an <option value="{id}">{label}</option>.
      expect(region).toContain(`<option value="${t.id}">${t.label}</option>`);
    }
    // No letter template leaks into the certificate select's own option set.
    for (const t of letterTemplates) {
      expect(region).not.toContain(`value="${t.id}"`);
    }
  });

  it('offers exactly the letter-kind templates as letter options (id + label)', async () => {
    const body = await dashboardHtml();
    expect(letterTemplates.length).toBeGreaterThan(0);
    const region = selectRegion(body, 'letter-template');
    for (const t of letterTemplates) {
      expect(region).toContain(`<option value="${t.id}">${t.label}</option>`);
    }
    // No certificate template leaks into the letter select's own option set.
    for (const t of certTemplates) {
      expect(region).not.toContain(`value="${t.id}"`);
    }
  });

  it('keeps the convention-extended "(lawyer-review)" labels verbatim in the picker', async () => {
    const body = await dashboardHtml();
    // At least one lawyer-review label exists in the catalog and surfaces as-is.
    const lr = DOC_TEMPLATES.filter((t) => /lawyer-review/.test(t.label));
    expect(lr.length).toBeGreaterThan(0);
    for (const t of lr) {
      expect(body).toContain(t.label);
    }
  });

  it('keeps the picker CSP-clean (no inline style or handler on the new controls)', async () => {
    const body = await dashboardHtml();
    expect(body).not.toMatch(/<[a-z][^>]*\sstyle=/i);
    expect(body).not.toMatch(/\son[a-z]+=/);
  });
});

describe('adminScript() — document-template picker wiring (WS1)', () => {
  it('injects the catalog JSON ONCE into the nonce-ready script (no new fetch)', () => {
    // The route passes JSON.stringify(DOC_TEMPLATES); adminScript() defaults to
    // an empty catalog so the 8 zero-arg call sites stay green.
    const src = adminScript(JSON.stringify(DOC_TEMPLATES));
    expect(src).toContain('var DOC_TEMPLATES =');
    // The catalog rides the inline script, NOT a network fetch for templates.
    expect(src).not.toContain("fetch('/api/templates'");
    // The injection is breakout-safe: no raw </script> survives (the route
    // escapes '<' → '<' before embedding).
    expect(src).not.toContain('</script>');
    // Default (zero-arg) stays an empty array literal — IIFE bounds intact.
    const bare = adminScript();
    expect(bare).toContain('var DOC_TEMPLATES = [];');
    expect(bare.startsWith('(function(){')).toBe(true);
    expect(bare.trimEnd().endsWith('})();')).toBe(true);
  });

  it('wires both picker <select>s by id to a confirm-then-populate change handler', () => {
    const src = adminScript();
    // Both selects are resolved by their ids and listened to.
    expect(src).toContain("getElementById('cert-template')");
    expect(src).toContain("getElementById('letter-template')");
    expect(src).toContain("addEventListener('change'");
    // A non-empty composer prompts before being replaced (window.confirm).
    expect(src).toContain('confirm');
  });

  it('rebuilds the certificate body composer blocks from the template paragraphs', () => {
    const src = adminScript();
    // The cert path fills the scalar inputs and REBUILDS the contenteditable body
    // (one block per paragraph) via the existing buildBlock/setAlign machinery —
    // honouring a leading [[align:…]] directive when present.
    expect(src).toContain('applyCertTemplate');
    expect(src).toContain('buildBlock');
    expect(src).toContain('setAlign');
    // The align directive is parsed off the front of a paragraph (parity with the
    // serializer's [[align:…]] grammar) so a directed paragraph lands aligned. The
    // alternation is unique to parseAlignedParagraph's own regex (the embedded
    // serializer uses normalizeAlign, never this literal) — so this pins the parse
    // branch, not the serializer source that also mentions "[[align:".
    expect(src).toContain('align:(left|center|right|justify)');
  });

  it('fills the letterhead fields + body from a letter template', () => {
    const src = adminScript();
    expect(src).toContain('applyLetterTemplate');
    // recipientLines populate the textarea (joined by newlines — the inverse of
    // splitLines), and the body composer is rebuilt the same way as the cert.
    expect(src).toContain('recipientLines');
    expect(src).toContain('letterRoot()');
  });

  // Belt-and-suspenders contract guard. applyCertTemplate / applyLetterTemplate
  // read these NESTED fields off the catalog at RUNTIME (the injected JSON is an
  // untyped JS blob, so a rename of any cert.*/letter.* key would break populate
  // SILENTLY — typecheck only guards the top-level {id,label,kind} the SSR uses).
  // These names are the frozen CredentialContent/LetterContent fields, so a drift
  // would be a cross-package contract change; asserting them here makes any such
  // drift trip THIS suite loudly too. (Optional fields like cert.closingLine /
  // letter.{reference,subject,salutation,valediction} are read defensively with
  // `|| ''`, so only the always-present keys are required here.)
  it('catalog still carries the nested fields the populate path reads (contract guard)', () => {
    const certs = DOC_TEMPLATES.filter((t) => t.kind === 'certificate');
    const letters = DOC_TEMPLATES.filter((t) => t.kind === 'letter');
    expect(certs.length).toBeGreaterThan(0);
    expect(letters.length).toBeGreaterThan(0);
    for (const t of certs) {
      expect(t.cert, `${t.id} is kind=certificate but has no cert payload`).toBeDefined();
      for (const key of ['type', 'kicker', 'title', 'intro', 'bodyParagraphs'] as const) {
        expect(t.cert, `${t.id}.cert is missing required field ${key}`).toHaveProperty(key);
      }
      expect(Array.isArray(t.cert?.bodyParagraphs)).toBe(true);
    }
    for (const t of letters) {
      expect(t.letter, `${t.id} is kind=letter but has no letter payload`).toBeDefined();
      for (const key of ['recipientLines', 'bodyParagraphs'] as const) {
        expect(t.letter, `${t.id}.letter is missing required field ${key}`).toHaveProperty(key);
      }
      expect(Array.isArray(t.letter?.recipientLines)).toBe(true);
      expect(Array.isArray(t.letter?.bodyParagraphs)).toBe(true);
    }
  });
});

describe('adminScript() — 3-mode console wiring (§E)', () => {
  it('wires the letterhead preview + issue to the §F.2 routes via shared helpers', () => {
    const src = adminScript();
    // Letterhead issue + preview hit the exact routes; issue reads documentId.
    expect(src).toContain("'/api/letters'");
    expect(src).toContain("'/api/letters/preview'");
    expect(src).toContain('j.documentId');
    // The blob-preview helper is SHARED (one extraction, both panels call it) and
    // uses raw fetch + .blob() (NOT api(), which JSON-parses the body).
    expect(src).toContain('function blobPreview');
    expect(src).toContain('.blob()');
    // recipientLines is the textarea split on newlines (trimmed, empties dropped).
    expect(src).toContain("recipientLines: splitLines(");
    // The shared serializer feeds BOTH editors (cert zero-arg call site preserved).
    expect(src).toContain('bodyParagraphs: collectBody()');
    expect(src).toContain('collectBody(letterRoot())');
  });

  it('drives the mode tablist (roving tabindex + [hidden] panels, CSP-clean)', () => {
    const src = adminScript();
    // Roving tabindex / aria-selected + arrow-key activation; panels toggle via
    // the .hidden property (a boolean attribute — never a style attribute).
    expect(src).toContain('role="tablist"');
    expect(src).toContain("setAttribute('aria-selected'");
    expect(src).toContain('panel.hidden');
    // The only CSSOM writes anywhere in the script are the Mode-3 placement box's
    // left/top/width/height (permitted by CSP for smooth drag). Nothing assigns any
    // OTHER style property — and no HTML style="" attribute is ever emitted (that is
    // the actual CSP boundary, asserted on the rendered HTML elsewhere).
    expect(src).not.toMatch(/\.style\.(?!left|top|width|height)[a-zA-Z]/);
  });

  it('wires the upload→stamp→sign flow to the §F.2 routes (inspect/preview/sign)', () => {
    const src = adminScript();
    // Inspect uses api() (JSON) with the base64 PDF; preview uses the SHARED blob
    // viewer; sign is a RAW fetch (api() would JSON-parse the PDF bytes and throw).
    expect(src).toContain("'/api/uploads/inspect'");
    expect(src).toContain("'/api/uploads/preview'");
    expect(src).toContain("fetch('/api/uploads'");
    expect(src).toContain('function blobPreview'); // reused, not re-authored
    // The PDF is read as STANDARD base64 (data-URL tail), NOT the base64url
    // bufToB64u (Node's Buffer.from('base64') need not accept '-_'/no-pad).
    expect(src).toContain('readAsDataURL');
    // Sign reads the document id from the X-Document-Id response header and saves
    // the returned blob as <id>.pdf (createObjectURL + a.download + revoke).
    expect(src).toContain("headers.get('X-Document-Id')");
    expect(src).toContain('a.download');
    expect(src).toContain('createObjectURL');
    expect(src).toContain('revokeObjectURL');
    // The sign payload carries the signUploadSchema fields (filename + password).
    expect(src).toContain('originalFilename');
    expect(src).toContain('placeHandwrittenSignature');
    // A successful sign refreshes the kind-aware issued list.
    expect(src).toContain('refreshList');
  });

  it('drives the placement box via the CSSOM only (drag + keyboard), CSP-clean', () => {
    const src = adminScript();
    // Pointer drag/resize + keyboard move/resize attach via addEventListener (no
    // inline handlers) and position the box through the CSSOM geometry allowlist.
    expect(src).toContain("addEventListener('pointerdown'");
    expect(src).toContain("addEventListener('pointermove'");
    expect(src).toContain('.style.left');
    expect(src).toContain('.style.top');
    expect(src).toContain('.style.width');
    // The placement is emitted as SignaturePlacement fractions {page,xPct,yPct,wPct}.
    expect(src).toContain('xPct');
    expect(src).toContain('yPct');
    expect(src).toContain('wPct');
    // Still ONLY the geometry allowlist — no other inline style property is set.
    expect(src).not.toMatch(/\.style\.(?!left|top|width|height)[a-zA-Z]/);
  });
});

// ---------------------------------------------------------------------------
// The serializer trust boundary (§4.4). These are the cross-agent reference
// vectors: the editor MUST emit tight, well-formed in-band markup that the
// render compiler (Agent R) accepts. Built on a minimal structural fake of the
// DOM `Node` interface (nodeType 1=element/3=text, UPPERCASE tagName) — no
// jsdom, so the same vectors run in the default node test environment.
// ---------------------------------------------------------------------------
describe('serializeBlock / serializeBody (trust boundary, §4.4)', () => {
  /** A fake text node. */
  function t(value: string): SNode {
    return { nodeType: 3, childNodes: [], textContent: value };
  }
  /** A fake element node; `tag` is UPPERCASE as the DOM reports it. */
  function e(tag: string, ...children: SNode[]): SNode {
    const text = children.map((c) => c.textContent ?? '').join('');
    return { nodeType: 1, tagName: tag, childNodes: children, textContent: text };
  }
  /** Serialise a single block's inline markup (pre-trim, pre-directive). */
  const block = (...children: SNode[]): string => serializeBlock(e('DIV', ...children));

  it('passes plain text through verbatim (unescaped — the render compiler escapes)', () => {
    expect(block(t('Hello world'))).toBe('Hello world');
    expect(block(t('a < b & c > d "q" \'s\''))).toBe('a < b & c > d "q" \'s\'');
    expect(block(t('file_name and 2 * 3'))).toBe('file_name and 2 * 3');
  });

  it('maps STRONG/B → **, EM/I → *, U → __ (both semantic and execCommand tags)', () => {
    expect(block(e('STRONG', t('Acme')))).toBe('**Acme**');
    expect(block(e('B', t('Acme')))).toBe('**Acme**');
    expect(block(e('EM', t('role')))).toBe('*role*');
    expect(block(e('I', t('role')))).toBe('*role*');
    expect(block(e('U', t('name')))).toBe('__name__');
  });

  it('composes bold+italic by nesting → ***x*** (strong>em)', () => {
    expect(block(e('STRONG', e('EM', t('x'))))).toBe('***x***');
    // execCommand can nest <b><i>…</i></b> too.
    expect(block(e('B', e('I', t('x'))))).toBe('***x***');
    // Underline + bold nests likewise.
    expect(block(e('U', e('STRONG', t('x'))))).toBe('__**x**__');
  });

  it('keeps delimiters TIGHT: hoists surrounding whitespace OUTSIDE the marks', () => {
    // Naive wrapping would give `** x **`, which the compiler renders LITERAL.
    expect(block(e('STRONG', t(' x ')))).toBe(' **x** ');
    expect(block(t('a '), e('EM', t(' b ')), t(' c'))).toBe('a  *b*  c');
  });

  it('drops empty/whitespace-only marks (no stray **** leaking into the body)', () => {
    expect(block(e('B'))).toBe('');
    expect(block(e('STRONG', t('   ')))).toBe('   '); // whitespace survives, marks dropped
    expect(block(t('x'), e('B'), t('y'))).toBe('xy');
  });

  it('UNWRAPS unknown elements but recurses into their children (sinks vanish)', () => {
    // A pasted <a href><strong>x</strong></a> reduces to **x** (no href).
    expect(block(e('A', e('STRONG', t('x'))))).toBe('**x**');
    // <b style=...> is still recognised as bold; the attribute is simply never
    // emitted (the fake carries none — attributes are outside the trust surface).
    expect(block(e('B', t('keep')))).toBe('**keep**');
    // A pasted <script>/<img onerror> reduces to its text content only.
    expect(block(e('SCRIPT', t('alert(1)')))).toBe('alert(1)');
    expect(block(e('IMG'))).toBe('');
    // The <div>/<br> a contenteditable injects on Enter unwrap to text.
    expect(block(e('DIV', t('p1')), e('BR'), t('p2'))).toBe('p1p2');
  });

  it('never strips a user-typed [[align:…]] token (that is §2.2 collision, compiler handles it)', () => {
    expect(block(t('[[align:left]]Hello'))).toBe('[[align:left]]Hello');
  });

  it('serializeBody prepends exactly one directive per non-empty block (incl. justify)', () => {
    const out = serializeBody([
      { root: e('DIV', e('STRONG', t('Bold'))), align: 'center' },
      { root: e('DIV', t('plain')), align: 'justify' },
      { root: e('DIV', t('right side')), align: 'right' },
    ]);
    expect(out).toEqual([
      '[[align:center]]**Bold**',
      '[[align:justify]]plain',
      '[[align:right]]right side',
    ]);
  });

  it('serializeBody trims markup and drops empty paragraphs (mirrors .filter(Boolean))', () => {
    const out = serializeBody([
      { root: e('DIV', t('  spaced  ')), align: 'left' },
      { root: e('DIV', e('B')), align: 'left' }, // empty mark → dropped
      { root: e('DIV', t('   ')), align: 'left' }, // whitespace only → dropped
      { root: e('DIV'), align: 'left' }, // no children → dropped
      { root: e('DIV', t('kept')), align: 'left' },
    ]);
    // No directive-only string is ever emitted; empties vanish.
    expect(out).toEqual(['[[align:left]]spaced', '[[align:left]]kept']);
  });

  it('serializeBody falls back to justify for an unknown alignment key', () => {
    const out = serializeBody([{ root: e('DIV', t('x')), align: 'middle' }]);
    expect(out).toEqual(['[[align:justify]]x']);
  });

  it('serializeBody yields [] for an all-empty editor (server .min(1) then 400s)', () => {
    const out = serializeBody([
      { root: e('DIV'), align: 'left' },
      { root: e('DIV', t('  ')), align: 'center' },
    ]);
    expect(out).toEqual([]);
  });
});
