/**
 * Server-rendered HTML shell shared by the admin UI and super-admin panel.
 *
 * Zero third-party assets, zero CDN. The stylesheet is the shared
 * {@link designSystemCss} from `@dmjone/brand` ("The Sealed Instrument") so the
 * web admin surface, the public verify surface, and the printed PDF never drift
 * on palette or type. It is inlined under the per-request CSP nonce; any
 * interactivity is a single inline nonce'd vanilla-JS block passed by the caller.
 * Brand woff2 load same-origin from the issuer's in-memory `/fonts/:file` route
 * (`font-src 'self'` — no CDN, offline-safe).
 *
 * Two registers (per the brief), selected with {@link PageOptions.register}:
 *  - "ornamental" (default): the admin sign-in / bootstrap / dashboard. Warm
 *    cream paper, watercolour wash, gold masthead — the SEALING ceremony.
 *  - "sober": the super-admin §63 court instrument. No wash, no studs, no
 *    script; gold-soft ruled headings and a particulars grid.
 *
 * The markup is semantic and WCAG 2.2 AA-minded: a skip link, a single h1,
 * labelled controls, visible focus, `prefers-reduced-motion` honoured, no
 * information by colour alone.
 */

import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';

import { designSystemCss, IDENTITY } from '@dmjone/brand';

/**
 * Issuer-only style addendum appended after {@link designSystemCss}.
 *
 * The shared sheet is class-based; these rules cover the few controls the issuer
 * surfaces still emit as BARE elements and — critically — the controls the
 * VERBATIM-preserved admin script builds at runtime (`document.createElement`),
 * which markup classes cannot reach:
 *   - the revoke `<button class="secondary">` (admin-script sets `secondary`,
 *     not `btn secondary`);
 *   - the live status `<span class="badge valid|revoked">` (admin-script sets
 *     `badge valid` / `badge revoked`, which the shared sheet does not define —
 *     it only ships `.badge.intact`/`.badge.check` and `.pill.*`).
 * Styling them here keeps `admin-script.ts` genuinely untouched.
 *
 * It also gives the masthead/footer their cream-institution dress, gates the
 * page wash OFF for the sober (super-admin) register, and styles the bare
 * `<button>`/`.notice`/security-output that the admin markup uses.
 *
 * String.raw mirrors designSystemCss(): no backtick or ${ appears in the body,
 * and there are no CSS unicode escapes here, but raw keeps the authoring rule
 * uniform and future-proof.
 */
const ISSUER_CSS = String.raw`
/* ---- Issuer masthead / shell -------------------------------------------- */
header.app{display:flex;align-items:baseline;gap:.7ch;flex-wrap:wrap;
  max-width:880px;margin:0 auto;padding:clamp(20px,4vw,40px) clamp(16px,4vw,32px) 0}
header.app .mark{font-family:var(--display);font-size:clamp(22px,3.4vw,30px);letter-spacing:.01em;color:var(--ink)}
header.app .mark b{color:var(--gold-deep);font-weight:700}
header.app .role{margin-left:auto;align-self:center;font-family:var(--label);
  font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold-deep)}
header.app .descriptor{flex-basis:100%;font-size:12.5px;color:var(--ink-soft);margin-top:4px}
main.wrap{padding-top:clamp(12px,2.4vw,20px)}
h1{font-family:var(--display);font-weight:700;font-size:clamp(24px,4vw,34px);
  letter-spacing:.02em;color:var(--ink);margin:8px 0 4px;line-height:1.12}
h2{font-family:var(--label);font-size:13px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--gold-deep);font-weight:400;margin:0 0 12px}
.lede{font-size:14.5px;color:var(--ink-soft);margin:0 0 6px}
.card p{font-size:14.5px;color:var(--ink-soft)}
/* the issuance form's field labels in Marcellus (the shared base label{} inherits serif) */
.card form label{font-family:var(--label);letter-spacing:.04em;color:var(--ink-soft)}
/* the credential-id chip the admin script builds via createElement('code') (no class) */
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Courier New",monospace;font-size:13px;
  background:#F4EFE6;padding:2px 7px;border-radius:6px;color:var(--ink)}

/* ---- Bare controls the admin markup + admin-script.ts emit --------------- */
/* The shared sheet styles .btn; the issuer keeps a few semantic bare buttons
   and the runtime-built revoke button (class "secondary"). Make all buttons,
   and a standalone .secondary, read as gold-soft chrome from the same tokens. */
button{font-family:var(--label);letter-spacing:.05em;font-size:14px;padding:12px 18px;
  border-radius:10px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;
  border:1px solid var(--gold-deep);background:var(--gold-deep);
  color:#fff;transition:background 120ms ease}
button:hover{background:#6E520F;color:#fff}
button.secondary,.secondary{font-family:var(--label);letter-spacing:.05em;font-size:14px;
  padding:10px 16px;border-radius:10px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;
  background:#fff;border:1px solid rgba(176,137,47,.34);color:var(--ink)}
button.secondary:hover,.secondary:hover{background:#FBF7EF;color:var(--ink)}
button.danger{background:var(--bad-soft);border-color:var(--bad);color:var(--bad)}
button.danger:hover{background:#F1D4D1;color:var(--bad)}

/* the live status badge the admin script builds: badge valid | badge revoked */
.badge.valid{background:var(--ok-soft);color:var(--ok);border-color:#BFE0CC}
.badge.revoked{background:var(--bad-soft);color:var(--bad);border-color:#E7C3C0}

/* ---- Layout helpers for the issuer cards --------------------------------- */
.row{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start}
.muted{color:var(--ink-soft)}
.notice{padding:.75rem .9rem;border-radius:10px;border:1px solid rgba(176,137,47,.30);
  background:#FBF7EF;margin:.75rem 0;font-size:14px;color:var(--ink-soft)}
.notice[role=alert]{border-color:var(--bad);background:var(--bad-soft);color:var(--bad)}
.notice strong{color:var(--bad)}
table{width:100%;border-collapse:collapse;margin-top:10px}
th,td{text-align:left;padding:.55rem .5rem;border-bottom:1px solid rgba(176,137,47,.22);font-size:14px}
th{font-family:var(--label);letter-spacing:.06em;text-transform:uppercase;font-weight:400;
  color:var(--gold-deep);font-size:12px}
#security-out{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Courier New",monospace;
  font-size:12.5px;white-space:pre-wrap;word-break:break-word;color:var(--ink-soft);margin:12px 0 0}
[hidden]{display:none!important}

/* ---- Live "type-inside-the-render" body editor (frozen contract §4) --------
   A faithful composing surface: a read-only echo of intro + recipient ABOVE,
   the editable body column in the MIDDLE (mirroring the certificate body
   typography — var(--serif), 11.5pt, line-height 1.62, ink on cream paper,
   152mm column, default justify), and a signature/QR placeholder BELOW. Every
   rule is class-based and lives under the nonce'd <style> — ZERO inline-style
   attributes (CSP). The four pa-* alignment classes are duplicated from
   template.ts (§2.4) so the toggle reflects exactly what the PDF will render. */
.card-label{display:block;font-family:var(--label);letter-spacing:.04em;color:var(--ink-soft);
  font-size:13px;margin:14px 0 6px}
.body-hint{font-size:13px;margin:0 0 8px}
.body-hint strong{font-weight:600}.body-hint em{font-style:italic}.body-hint u{text-decoration:underline}
.composer{margin:14px 0 4px}
.composer .canvas{background:var(--paper);border:1px solid var(--rule-outer);
  border-radius:12px;padding:clamp(16px,3vw,26px);box-shadow:0 1px 2px rgba(120,90,40,.06)}
/* read-only echo above + signature/QR placeholder below: certificate-accurate,
   muted so the editable column is the clear focus. */
.body-echo{text-align:center;color:var(--ink-soft);border-bottom:1px dashed var(--rule-inner);
  padding-bottom:14px;margin-bottom:14px}
.body-echo .echo-intro{font-family:var(--serif);font-style:italic;font-size:12.5pt;color:var(--ink-soft)}
.body-echo .echo-recipient{font-family:var(--display);font-weight:600;font-size:20pt;color:var(--ink);
  margin-top:4px;display:inline-block;padding-bottom:3px;border-bottom:.9pt solid var(--gold-soft)}
.body-placeholder{text-align:center;color:var(--ink-soft);border-top:1px dashed var(--rule-inner);
  padding-top:14px;margin-top:14px;font-family:var(--label);font-size:11px;letter-spacing:.18em;
  text-transform:uppercase}
/* the editable body column itself — mirrors template.ts .body / .body p exactly. */
#body-editor{max-width:152mm;margin:0 auto}
.para-block{position:relative;margin-bottom:2.6mm}
.para-edit{font-family:var(--serif);font-size:11.5pt;line-height:1.62;color:var(--ink);
  text-align:justify;text-justify:inter-word;min-height:1.62em;padding:6px 8px;border-radius:8px;
  border:1px solid transparent;outline:none}
.para-edit:hover{border-color:var(--rule-inner)}
.para-edit:focus-within,.para-edit:focus{border-color:var(--gold);
  box-shadow:0 0 0 3px rgba(176,137,47,.18);background:#fff}
.para-edit strong{font-weight:600}
.para-edit em{font-style:italic}
.para-edit u{text-decoration:underline}
.para-edit:empty::before{content:attr(data-placeholder);color:var(--ink-soft);font-style:italic;
  opacity:.7;pointer-events:none}
/* per-paragraph alignment controls (a small labelled bar under each block). */
.para-tools{display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap}
.para-tools .lbl{font-family:var(--label);font-size:10px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--ink-soft)}
.align-btn,.mark-btn{font-family:var(--label);font-size:13px;letter-spacing:.02em;
  min-width:34px;height:32px;padding:0 9px;border-radius:8px;cursor:pointer;
  display:inline-flex;align-items:center;justify-content:center;
  background:#fff;border:1px solid var(--rule-outer);color:var(--ink);transition:background 120ms ease}
.align-btn:hover,.mark-btn:hover{background:#FBF7EF;color:var(--ink)}
.align-btn[aria-pressed=true],.mark-btn[aria-pressed=true]{background:var(--gold-deep);
  border-color:var(--gold-deep);color:#fff}
.align-btn:focus-visible,.mark-btn:focus-visible{outline:2px solid var(--gold-deep);outline-offset:2px}
.para-rm{margin-left:auto;background:#fff;border:1px solid rgba(176,137,47,.34);color:var(--ink-soft);
  min-width:32px;height:32px;padding:0 9px;border-radius:8px;cursor:pointer;
  display:inline-flex;align-items:center;justify-content:center}
.para-rm:hover{background:#FBF7EF}
/* shared B/I/U toolbar (role=toolbar, roving tabindex). */
.mark-toolbar{display:flex;align-items:center;gap:6px;margin:0 0 10px;flex-wrap:wrap}
.mark-toolbar .mark-btn{font-weight:600;min-width:38px}
.mark-toolbar .mark-btn .i{font-style:italic;font-weight:400}
.mark-toolbar .mark-btn .u{text-decoration:underline}
.composer-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;align-items:center}
/* embedded PDF preview viewer (blob: iframe — frame-src 'self' blob:). */
.preview-frame{width:100%;height:min(78vh,1000px);border:1px solid var(--rule-outer);
  border-radius:12px;background:#d8d8d8;margin-top:12px;display:block}
/* the four blessed paragraph-alignment classes (§2.4) — shared with template.ts
   so the editor preview matches the rendered certificate byte-for-byte. */
.pa-left{text-align:left}
.pa-center{text-align:center}
.pa-right{text-align:right}
.pa-justify{text-align:justify;text-justify:inter-word}
@media (prefers-reduced-motion: reduce){
  .align-btn,.mark-btn,.para-rm,button{transition:none}
}

/* ---- Mode switcher (role=tablist): Certificate · Letterhead · Upload -------
   A roving-tabindex tablist above the issuance panels. Each tab is a gold-soft
   chrome chip; the selected tab reads as the filled gold token (never colour
   ALONE — aria-selected + the underline rule carry it too). Panels toggle with
   the [hidden] boolean attribute (already display:none!important above) — no
   inline style, CSP-clean. */
.mode-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 18px;
  border-bottom:1px solid rgba(176,137,47,.22);padding-bottom:0}
.mode-tab{font-family:var(--label);letter-spacing:.06em;font-size:13.5px;
  padding:10px 18px;border-radius:10px 10px 0 0;cursor:pointer;
  background:#fff;border:1px solid rgba(176,137,47,.34);border-bottom:none;
  color:var(--ink-soft);position:relative;top:1px;transition:background 120ms ease,color 120ms ease}
.mode-tab:hover{background:#FBF7EF;color:var(--ink)}
.mode-tab[aria-selected=true]{background:var(--gold-deep);border-color:var(--gold-deep);
  color:#fff;box-shadow:0 -1px 0 var(--gold-deep)}
.mode-tab:focus-visible{outline:2px solid var(--gold-deep);outline-offset:2px}
.mode-panel:focus{outline:none}

/* ---- Mode 3: upload & attest panel --------------------------------------- */
/* The placement STAGE is an aspect-correct scaled rectangle of the chosen page;
   its width/height are set at runtime via the CSSOM (element.style.*) from the
   page's widthPt:heightPt — never an inline style attribute. The signature BOX
   inside it is absolutely positioned (left/top/width/height also via CSSOM) and
   draggable/resizable; only its CHROME (border, cursor, handle) lives here. */
.upload-meta{font-size:13px;margin:6px 0 10px}
.upload-sign-row{display:flex;align-items:center;gap:9px;margin:8px 0 6px}
.upload-sign-row input[type=checkbox]{width:18px;height:18px;accent-color:var(--gold-deep);cursor:pointer}
.upload-sign-row label{font-family:var(--label);letter-spacing:.04em;color:var(--ink-soft);cursor:pointer}
.upload-placement{margin:8px 0 6px}
.upload-page-row{display:flex;align-items:center;gap:10px;margin:0 0 8px;flex-wrap:wrap}
.upload-page-row label{font-family:var(--label);letter-spacing:.04em;color:var(--ink-soft)}
.upload-page-row select{font-family:var(--label);font-size:14px;padding:8px 12px;border-radius:8px;
  border:1px solid var(--rule-outer);background:#fff;color:var(--ink);cursor:pointer}
.upload-stage{position:relative;margin:6px auto;background:var(--paper);
  border:1px solid var(--rule-outer);border-radius:8px;overflow:hidden;
  box-shadow:0 1px 3px rgba(120,90,40,.10);max-width:100%;touch-action:none}
.upload-sigbox{position:absolute;left:0;top:0;cursor:grab;
  border:1.5px dashed var(--gold-deep);border-radius:4px;background:rgba(176,137,47,.06);
  box-sizing:border-box;touch-action:none}
.upload-sigbox:focus-visible{outline:2px solid var(--gold-deep);outline-offset:2px}
.upload-sigbox:active{cursor:grabbing}
.upload-sigimg{display:block;width:100%;height:100%;object-fit:contain;
  pointer-events:none;user-select:none}
/* the handle sits just INSIDE the box corner so the stage's overflow:hidden
   never clips it when the box is flush against the page edge. */
.upload-resize{position:absolute;right:-1px;bottom:-1px;width:16px;height:16px;border-radius:50% 0 4px 0;
  background:var(--gold-deep);border:2px solid #fff;cursor:nwse-resize;
  box-shadow:0 1px 2px rgba(120,90,40,.35);touch-action:none}
@media (prefers-reduced-motion: reduce){
  .upload-page-row select,.upload-sign-row input{transition:none}
}

/* ---- SOBER register: strip the wash/crest for the super-admin instrument -- */
body.sober{background-image:none}
body.sober header.app .role{color:var(--ink-soft)}
`;

export interface PageOptions {
  title: string;
  nonce: string;
  /** Right-aligned role label in the header (e.g. "Issuer Admin"). */
  role: string;
  body: HtmlEscapedString | Promise<HtmlEscapedString>;
  /** Optional inline script body (no external src), rendered under the nonce. */
  script?: string;
  /**
   * Visual register. "ornamental" (default) is the warm, washed sealing surface
   * for the admin console; "sober" is the wash-free §63 court instrument for the
   * super-admin panel (it also adds the `.sober` body class for max-width + rules).
   */
  register?: 'ornamental' | 'sober';
}

/** Render a complete HTML document with nonce'd inline CSS (+ optional JS). */
export async function page(opts: PageOptions): Promise<string> {
  const scriptTag = opts.script
    ? html`<script nonce="${opts.nonce}">${raw(opts.script)}</script>`
    : '';
  const sober = opts.register === 'sober';
  const bodyClass = sober ? 'sober' : '';
  const mainClass = sober ? 'wrap wrap--narrow sober' : 'wrap';
  const css = designSystemCss() + ISSUER_CSS;
  const doc = html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="robots" content="noindex, nofollow" />
<title>${opts.title}</title>
<link rel="preload" as="font" type="font/woff2"
  href="/fonts/playfair-display-latin-700-normal.woff2" crossorigin />
<style nonce="${opts.nonce}">${raw(css)}</style>
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to main content</a>
<header class="app">
<span class="mark">dmj<b>.one</b></span>
<span class="role">${opts.role}</span>
<span class="descriptor">${IDENTITY.trustService} · ${IDENTITY.descriptor}</span>
</header>
<main id="main" class="${mainClass}">${opts.body}</main>
${scriptTag}
</body>
</html>`;
  return (await doc).toString();
}
