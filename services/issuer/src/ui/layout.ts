/**
 * Server-rendered HTML shell shared by the admin UI and super-admin panel.
 *
 * Zero third-party assets, zero CDN. All CSS is inline under the per-request CSP
 * nonce; any interactivity is a single inline nonce'd vanilla-JS block passed by
 * the caller. The markup is semantic and WCAG 2.2 AA-minded: a skip link, a
 * single h1, labelled controls, visible focus, `prefers-reduced-motion` and
 * `prefers-color-scheme` honoured, no information by colour alone.
 */

import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';

/** Shared, restrained design tokens + base styles (no external fonts). */
const BASE_CSS = `
:root{color-scheme:light dark;--bg:#0f1115;--panel:#171a21;--ink:#e8eaf0;--muted:#9aa3b2;
--line:#2a2f3a;--accent:#c9a227;--accent-ink:#1a1300;--ok:#2e7d32;--bad:#b3261e;--focus:#7cc7ff;}
@media (prefers-color-scheme:light){:root{--bg:#f6f7f9;--panel:#fff;--ink:#1b1f27;--muted:#5b6473;
--line:#e2e5ea;--accent:#8a6d0f;--accent-ink:#fff;}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
.skip{position:absolute;left:-999px;top:0;background:var(--accent);color:var(--accent-ink);
padding:.5rem 1rem;z-index:10}
.skip:focus{left:0}
main{max-width:880px;margin:0 auto;padding:2rem 1.25rem 4rem}
header.app{display:flex;align-items:center;gap:.75rem;padding:1rem 1.25rem;border-bottom:1px solid var(--line);
background:var(--panel)}
header.app .brand{font-weight:700;letter-spacing:.02em}
header.app .role{margin-left:auto;color:var(--muted);font-size:.85rem}
h1{font-size:1.6rem;margin:.2rem 0 1rem}
h2{font-size:1.15rem;margin:2rem 0 .75rem;border-bottom:1px solid var(--line);padding-bottom:.35rem}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:1.25rem;margin:1rem 0}
label{display:block;font-weight:600;margin:.75rem 0 .25rem}
input,textarea,select{width:100%;padding:.6rem .7rem;border:1px solid var(--line);border-radius:8px;
background:var(--bg);color:var(--ink);font:inherit}
textarea{min-height:5rem;resize:vertical}
input:focus,textarea:focus,select:focus,button:focus,a:focus{outline:3px solid var(--focus);outline-offset:2px}
button{font:inherit;font-weight:650;padding:.6rem 1.1rem;border-radius:8px;border:1px solid var(--accent);
background:var(--accent);color:var(--accent-ink);cursor:pointer}
button.secondary{background:transparent;color:var(--ink);border-color:var(--line)}
button.danger{background:var(--bad);border-color:var(--bad);color:#fff}
.muted{color:var(--muted)}
.row{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center}
.badge{display:inline-block;padding:.15rem .55rem;border-radius:999px;font-size:.8rem;font-weight:700;
border:1px solid var(--line)}
.badge.valid{background:rgba(46,125,50,.15);color:var(--ok);border-color:var(--ok)}
.badge.revoked{background:rgba(179,38,30,.15);color:var(--bad);border-color:var(--bad)}
table{width:100%;border-collapse:collapse;margin-top:.5rem}
th,td{text-align:left;padding:.55rem .5rem;border-bottom:1px solid var(--line);font-size:.92rem}
code{background:rgba(127,127,127,.16);padding:.1rem .35rem;border-radius:5px;font-size:.9em}
.notice{padding:.7rem .9rem;border-radius:8px;border:1px solid var(--line);margin:.75rem 0}
.notice[role=alert]{border-color:var(--bad)}
[hidden]{display:none!important}
@media (prefers-reduced-motion:no-preference){a,button{transition:outline-color .12s ease}}
`;

export interface PageOptions {
  title: string;
  nonce: string;
  /** Right-aligned role label in the header (e.g. "Issuer Admin"). */
  role: string;
  body: HtmlEscapedString | Promise<HtmlEscapedString>;
  /** Optional inline script body (no external src), rendered under the nonce. */
  script?: string;
}

/** Render a complete HTML document with nonce'd inline CSS (+ optional JS). */
export async function page(opts: PageOptions): Promise<string> {
  const scriptTag = opts.script
    ? html`<script nonce="${opts.nonce}">${raw(opts.script)}</script>`
    : '';
  const doc = html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${opts.title}</title>
<style nonce="${opts.nonce}">${raw(BASE_CSS)}</style>
</head>
<body>
<a class="skip" href="#main">Skip to main content</a>
<header class="app">
<span class="brand">dmj.one Trust Services</span>
<span class="role">${opts.role}</span>
</header>
<main id="main">${opts.body}</main>
${scriptTag}
</body>
</html>`;
  return (await doc).toString();
}
