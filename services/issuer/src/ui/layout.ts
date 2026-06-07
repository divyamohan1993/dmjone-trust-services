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
