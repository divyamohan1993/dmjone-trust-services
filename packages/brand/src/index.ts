/**
 * @dmjone/brand — the single source of the dmj.one visual language.
 *
 * Extracted verbatim from the approved letterhead template's `:root`. Consumed
 * by the certificate renderer (PDF) and the public verify page (web) so both
 * surfaces stay in lockstep. Tokens only — no framework, no runtime.
 */

/** Core palette. */
export const COLORS = {
  ink: '#2B2A28',
  inkSoft: '#5C554D',
  paper: '#FFFDFB',
  gold: '#B0892F',
  goldDeep: '#876616',
  goldSoft: '#CBA85E',
} as const;

/** Font family stacks. The named families are bundled via @fontsource/*. */
export const FONTS = {
  serif: '"EB Garamond", Georgia, serif',
  display: '"Playfair Display", Georgia, serif',
  label: '"Marcellus", "EB Garamond", serif',
  script: '"Great Vibes", cursive',
} as const;

/** The four font families that must be bundled (no network at render time). */
export const FONT_FAMILIES = [
  'EB Garamond',
  'Playfair Display',
  'Marcellus',
  'Great Vibes',
] as const;

/** Issuer-facing identity strings shown on web surfaces. */
export const IDENTITY = {
  name: 'dmj.one',
  trustService: 'dmj.one Trust Services',
  descriptor: 'Educational Platform · Independent Learning Initiative',
  motto: 'Dream · Manifest · Journey · Together as One',
  email: 'contact@dmj.one',
  phone: '+91 79799 30293',
} as const;

export type BrandColors = typeof COLORS;
export type BrandFonts = typeof FONTS;

/** Emit the palette + fonts as CSS custom properties for a :root block. */
export function cssVariables(): string {
  return [
    `--ink:${COLORS.ink}`,
    `--ink-soft:${COLORS.inkSoft}`,
    `--paper:${COLORS.paper}`,
    `--gold:${COLORS.gold}`,
    `--gold-deep:${COLORS.goldDeep}`,
    `--gold-soft:${COLORS.goldSoft}`,
    `--serif:${FONTS.serif}`,
    `--display:${FONTS.display}`,
    `--label:${FONTS.label}`,
    `--script:${FONTS.script}`,
  ].join(';');
}

/**
 * The full shared web design system — "The Sealed Instrument".
 *
 * One CSP-safe stylesheet consumed by BOTH the public verify surface and the
 * issuer admin surface so the web rendering never drifts from the printed PDF
 * (same palette, same four serif families, same gold double-frame language).
 *
 * Self-hosted brand fonts are referenced same-origin via `@font-face`
 * `url(/fonts/<file>.woff2)`; each service serves those bytes from its in-memory
 * `/fonts/:file` route (font-src 'self' — no CDN, offline-safe). The block holds
 * ZERO `style=""` attributes, ZERO inline handlers and ZERO external origins, so
 * it drops inside a single per-request nonce'd `<style>` without weakening CSP.
 *
 * Authored with {@link String.raw} because the rules contain CSS unicode escapes
 * (`content:"\00d7"`, `content:"\2212"`); a plain template literal would parse
 * `\00`/`\2` as illegal octal escapes. There is no backtick or `${` in the body,
 * so `String.raw` is safe and emits the backslashes verbatim into the CSS.
 *
 * The page markup that includes this is changed separately; this is the single
 * authoritative source of the stylesheet.
 */
export function designSystemCss(): string {
  return String.raw`/* ============================================================================
   dmj.one Trust Services — shared design system ("The Sealed Instrument")
   CSP-safe: every rule lives inside the single per-request nonce'd <style>.
   ZERO style="" attributes, ZERO inline handlers, ZERO external/CDN origins.
   Fonts referenced same-origin via @font-face url(/fonts/...) (font-src 'self').
   Palette/fonts consumed verbatim from @dmjone/brand so PDF and web never drift.
   ============================================================================ */

/* ---- Self-hosted fonts (served from the in-memory /fonts route) ---------- */
/* Only the woff2 weights/styles confirmed on disk are declared. */
@font-face{font-family:"EB Garamond";font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/eb-garamond-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"EB Garamond";font-style:italic;font-weight:400;font-display:swap;src:url(/fonts/eb-garamond-latin-400-italic.woff2) format("woff2")}
@font-face{font-family:"EB Garamond";font-style:italic;font-weight:500;font-display:swap;src:url(/fonts/eb-garamond-latin-500-italic.woff2) format("woff2")}
@font-face{font-family:"EB Garamond";font-style:normal;font-weight:600;font-display:swap;src:url(/fonts/eb-garamond-latin-600-normal.woff2) format("woff2")}
@font-face{font-family:"Playfair Display";font-style:normal;font-weight:600;font-display:swap;src:url(/fonts/playfair-display-latin-600-normal.woff2) format("woff2")}
@font-face{font-family:"Playfair Display";font-style:normal;font-weight:700;font-display:swap;src:url(/fonts/playfair-display-latin-700-normal.woff2) format("woff2")}
@font-face{font-family:"Marcellus";font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/marcellus-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"Great Vibes";font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/great-vibes-latin-400-normal.woff2) format("woff2")}

/* ---- Tokens (verbatim from brand.cssVariables() + web-only status set) ---- */
:root{
  /* Opt OUT of UA auto-dark: these are cream-paper surfaces. The color-scheme
     meta tag alone proved insufficient (Chromium auto-dark still inverted the
     cream to near-black); the CSS property on :root is the reliable opt-out and
     applies to every consumer of this sheet (verify + issuer admin). */
  color-scheme:light;
  --ink:#2B2A28; --ink-soft:#5C554D; --paper:#FFFDFB;
  --gold:#B0892F; --gold-deep:#876616; --gold-soft:#CBA85E;
  --serif:"EB Garamond",Georgia,serif;
  --display:"Playfair Display",Georgia,serif;
  --label:"Marcellus","EB Garamond",serif;
  --script:"Great Vibes",cursive;
  /* status tokens — desaturated, ink-adjacent so a verdict belongs to the cream institution.
     AA: --warn #8A5E0E hits 4.85:1 on --warn-soft (its darkest ground, the .pill.unconfirmed
     chip) and 5.69:1 on white; --ok 5.32:1 / --bad 7.62:1 on white. All three verdict
     colours clear 4.5:1 small-text on every background they render on. */
  --ok:#1F7A4D; --ok-soft:#E5F2EA; --warn:#8A5E0E; --warn-soft:#F6ECD6; --bad:#9A2B2B; --bad-soft:#F6E2E0;
  /* shared frame/elevation constants */
  --rule-outer:rgba(176,137,47,.34); --rule-inner:rgba(203,168,94,.45);
  --lift:0 1px 0 rgba(176,137,47,.18), 0 18px 44px -28px rgba(43,42,40,.45);
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-6:24px; --space-8:32px; --space-12:48px; --space-18:72px;
}

/* ---- Base ---------------------------------------------------------------- */
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  font-family:var(--serif); color:var(--ink); background:var(--paper);
  line-height:1.6; -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
  /* watercolour wash + zero-byte CSS crest echo (no PNG, no data-URI, no breath) */
  background-image:
    radial-gradient(36% 26% at 50% 46%, rgba(176,137,47,.05), transparent 60%),
    radial-gradient(60% 42% at 0% 0%,    rgba(243,205,210,.40), transparent 60%),
    radial-gradient(52% 38% at 100% 0%,  rgba(214,210,235,.36), transparent 60%),
    radial-gradient(58% 40% at 100% 100%,rgba(248,224,205,.40), transparent 62%),
    radial-gradient(50% 34% at 0% 100%,  rgba(238,210,222,.32), transparent 60%);
  background-attachment:fixed;
}
/* CONTRAST RULE: gold #B0892F (~3.2:1 on cream) only for large display + decoration;
   gold-deep #876616 (~5.3:1) for ALL small label/eyebrow/caption/link text. */
a{color:var(--gold-deep)}
.wrap{max-width:880px;margin:0 auto;padding:clamp(20px,4vw,56px) clamp(16px,4vw,32px) 72px}
.wrap--narrow{max-width:760px}
.skip{position:absolute;left:-9999px;top:auto}
.skip:focus{left:16px;top:12px;background:var(--ink);color:var(--paper);padding:8px 14px;border-radius:6px;z-index:10}
/* visually-hidden: carries pass/fail words + table headers to assistive tech */
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}
/* Focus ring uses gold-DEEP (5.25:1 on cream), not gold-soft (2.22:1, fails the
   1.4.11 3:1 floor for focus indicators). gold-soft stays the decorative token. */
:focus-visible{outline:3px solid var(--gold-deep);outline-offset:2px}

/* ---- Type scale (1.25 major-third, fluid) -------------------------------- */
.eyebrow{font-family:var(--label);font-size:11.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold-deep)}
.type-title{font-family:var(--display);font-weight:700;font-size:clamp(26px,4.6vw,40px);letter-spacing:.06em;text-transform:uppercase;color:var(--ink);margin:6px 0 0;line-height:1.08}
.recipient{font-family:var(--label);font-size:clamp(17px,2.4vw,21px);letter-spacing:.06em;color:var(--ink);margin-top:14px}
.recipient .lbl{display:block;font-family:var(--serif);font-style:italic;font-size:13px;letter-spacing:0;color:var(--ink-soft);margin-bottom:2px}
code.mono,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Courier New",monospace;font-size:13px}
code.mono{background:#F4EFE6;padding:2px 7px;border-radius:6px;color:var(--ink);overflow-wrap:anywhere}
/* upload hero: a user-supplied filename shown as a dignified document name —
   NOT force-uppercased (a long filename in caps becomes an unreadable blob). */
.type-title.doc-name{text-transform:none;letter-spacing:.004em;font-weight:700;font-size:clamp(20px,3.1vw,28px);line-height:1.22;overflow-wrap:break-word}
/* the file-type chip + document number beneath an attested-document headline */
.docmeta{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:13px;font-family:var(--label);font-size:13px;letter-spacing:.04em;color:var(--ink-soft)}
.docmeta .filechip{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-deep);border:1px solid var(--rule-inner);background:#FBF4E4;border-radius:6px;padding:3px 9px;line-height:1}
.docmeta .docnum .k{font-family:var(--serif);font-style:italic;letter-spacing:0;color:var(--ink-soft)}
.docmeta .docnum .mono{color:var(--ink)}

/* ---- Masthead ------------------------------------------------------------ */
header.brand{display:flex;align-items:baseline;gap:.7ch;flex-wrap:wrap;padding-bottom:18px;border-bottom:1px solid rgba(176,137,47,.28)}
.brand .mark{font-family:var(--display);font-size:clamp(22px,3.4vw,30px);letter-spacing:.01em;color:var(--ink)}
.brand .mark b{color:var(--gold-deep);font-weight:700}
.brand .svc{font-family:var(--label);font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold-deep)}
.brand .descriptor{flex-basis:100%;font-size:12.5px;color:var(--ink-soft);margin-top:2px}

/* ---- The certificate panel: frame-within-a-frame + diamond studs --------- */
.card{
  position:relative;margin-top:26px;background:#FFFFFF;
  border:1px solid var(--rule-outer);border-radius:16px;box-shadow:var(--lift);
  padding:clamp(20px,3.4vw,34px);
  animation:cardrise 280ms ease-out both;
}
.card::before{content:"";position:absolute;inset:6px;border:1px solid var(--rule-inner);border-radius:11px;pointer-events:none}
/* four diamond corner studs — the signature jewel, decorative only */
.card .stud{position:absolute;width:10px;height:10px;background:var(--gold);transform:rotate(45deg);box-shadow:0 0 0 1px rgba(135,102,22,.35);pointer-events:none;animation:studset 280ms ease-out both}
.card .stud.tl{top:-1px;left:-1px} .card .stud.tr{top:-1px;right:-1px}
.card .stud.bl{bottom:-1px;left:-1px} .card .stud.br{bottom:-1px;right:-1px}
.card .stud.tr{animation-delay:60ms} .card .stud.bl{animation-delay:120ms} .card .stud.br{animation-delay:180ms}

/* ---- Flourish divider (two fade-to-gold rules flanking a gold diamond) ---- */
.flourish{display:flex;align-items:center;gap:12px;margin:28px 0;color:var(--gold-soft)}
.flourish::before,.flourish::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,transparent,var(--gold-soft))}
.flourish::after{background:linear-gradient(90deg,var(--gold-soft),transparent)}
.flourish i{width:6px;height:6px;background:var(--gold);transform:rotate(45deg);display:block}

/* ---- Three-tier verdict -------------------------------------------------- */
/* Tier 1: plain-language verdict — the human sentence, ABOVE the ledger */
.verdict{margin-top:20px}
.verdict .word{font-family:var(--display);font-weight:700;font-size:clamp(24px,4vw,34px);letter-spacing:.01em;line-height:1.1;display:flex;align-items:center;gap:12px}
.verdict .glyph{width:22px;height:22px;flex:0 0 auto;display:inline-grid;place-items:center}
.verdict .sub{font-family:var(--serif);font-size:14.5px;color:var(--ink-soft);margin-top:6px}
.verdict.valid .word{color:var(--ok)} .verdict.revoked .word,.verdict.bad .word{color:var(--bad)} .verdict.unknown .word{color:var(--ink-soft)}
/* the seal flourish — Great Vibes, blooms under the word on VALID ONLY */
.seal{font-family:var(--script);font-size:34px;color:var(--gold-deep);margin-top:2px;height:0;opacity:0;overflow:hidden;transition:opacity 500ms ease,height 500ms ease}
.verdict.valid.sealed .seal{opacity:1;height:44px}

/* Tier 2: the live status badge + ledger (demoted, quieter) */
.status{display:flex;align-items:center;gap:12px;margin-top:22px;padding:14px 16px;border-radius:12px;border:1px solid transparent}
.status .dot{width:14px;height:14px;border-radius:50%;flex:0 0 auto}
.status .txt{font-family:var(--label);letter-spacing:.05em}
.status .txt b{display:block;font-size:16px;font-weight:400}
.status .txt span{display:block;font-size:12.5px;color:var(--ink-soft);font-family:var(--serif)}
.status.checking{background:#FBF6EA;border-color:var(--warn-soft)}
.status.checking .dot{background:var(--gold);animation:pulse 1.1s ease-in-out infinite}
.status.valid{background:var(--ok-soft);border-color:#BFE0CC} .status.valid .dot{background:var(--ok);animation:settle 220ms ease-out both}
.status.revoked,.status.bad{background:var(--bad-soft);border-color:#E7C3C0} .status.revoked .dot,.status.bad .dot{background:var(--bad)}
.status.unknown{background:#F1EEEA;border-color:#DAD3CA} .status.unknown .dot{background:var(--ink-soft)}
.checks{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:8px}
.checks li{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--ink-soft)}
.checks li .ic{width:18px;height:18px;flex:0 0 auto;border-radius:50%;border:1.5px solid currentColor;position:relative;color:var(--ink-soft)}
.checks li.run .ic{color:var(--gold);animation:spin 1s linear infinite;border-top-color:transparent}
.checks li.pass{color:var(--ok)} .checks li.pass .ic{color:var(--ok);border-color:var(--ok)}
.checks li.pass .ic::after{content:"";position:absolute;left:5px;top:2px;width:5px;height:9px;border:solid var(--ok);border-width:0 2px 2px 0;transform:rotate(45deg)}
.checks li.warn{color:var(--warn)} .checks li.warn .ic{color:var(--warn);border-color:var(--warn)}
.checks li.fail{color:var(--bad)} .checks li.fail .ic{color:var(--bad);border-color:var(--bad)}
.checks li.fail .ic::after{content:"\00d7";position:absolute;left:3px;top:-3px;font-size:15px;line-height:1}

/* Tier 3: §63 fact grid + trust statement */
.facts{margin-top:26px;border-top:1px solid rgba(176,137,47,.28)}
.facts h2{font-family:var(--label);font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold-deep);margin:18px 0 10px}
dl.grid{display:grid;grid-template-columns:minmax(140px,32%) 1fr;gap:10px 18px;margin:0}
dl.grid dt{font-family:var(--serif);font-style:italic;color:var(--ink-soft);font-size:14px}
dl.grid dd{margin:0;font-family:var(--label);letter-spacing:.02em;color:var(--ink);font-size:14.5px;min-width:0;overflow-wrap:anywhere}
.pill{display:inline-block;font-family:var(--label);font-size:12px;letter-spacing:.06em;text-transform:uppercase;padding:3px 10px;border-radius:999px}
.pill.valid{background:var(--ok-soft);color:var(--ok)} .pill.revoked{background:var(--bad-soft);color:var(--bad)} .pill.unknown{background:#F1EEEA;color:var(--ink-soft)}
.trust{margin-top:24px;padding:16px 18px;background:#FBF7EF;border:1px solid rgba(176,137,47,.30);border-radius:12px;font-size:13.5px;color:var(--ink-soft)}
.trust strong{color:var(--ink);font-weight:600}

/* ---- Upload FILE-GATE: a valid upload is NEVER shown as file-authentic from the
   id/QR alone (a copied QR/number can sit on any file); the dropzone earns it --- */
.verdict.unconfirmed .word{color:var(--gold-deep)}
.verdict.unconfirmed .glyph{color:var(--gold-deep);border:1.5px solid var(--gold-soft);border-radius:50%;font-size:13px}
.status.unconfirmed{background:#FBF6EA;border-color:var(--warn-soft)} .status.unconfirmed .dot{background:var(--gold)}
.pill.unconfirmed{background:var(--warn-soft);color:var(--warn)}
.filecheck{margin-top:22px;border:1px solid rgba(176,137,47,.32);border-radius:12px;background:#FBF7EF;padding:16px 18px}
.filecheck .fc-lead{font-family:var(--label);font-size:15px;letter-spacing:.04em;color:var(--ink);margin:0}
.filecheck .fc-why{font-size:13px;color:var(--ink-soft);margin:6px 0 13px}
/* Dropzone border uses --gold (3.25:1 on white), not --gold-soft (2.26:1): the
   dashed edge is a functional drop-target affordance, so it clears 1.4.11's 3:1
   even though the gold-deep .fc-cta/.btn inside also identify it. Resting --gold
   -> .over --gold-deep stays a natural darkening cue. */
.fc-drop{border:1.5px dashed var(--gold);border-radius:10px;background:#fff;padding:14px 16px;display:flex;flex-wrap:wrap;align-items:center;gap:12px;transition:border-color 120ms ease,background 120ms ease}
.fc-drop.over{border-color:var(--gold-deep);background:#FCF7EC}
.fc-cta{font-family:var(--label);font-size:13.5px;letter-spacing:.02em;color:var(--gold-deep);cursor:pointer;flex:1 1 220px}
.fc-input{flex:1 1 170px;font-size:13px;padding:7px 8px}
.fc-drop .btn{flex:0 0 auto}
.fc-note{font-size:12px;color:var(--ink-soft);margin:13px 0 0;overflow-wrap:anywhere}
.fc-note .mono{font-size:11px}
.fc-msg{font-size:13.5px;margin:10px 0 0;min-height:1.2em}
.fc-msg.ok{color:var(--ok);font-family:var(--label)} .fc-msg.err{color:var(--bad);font-family:var(--label)}

/* ---- Buttons / actions / panels (shared by verify + issuer) -------------- */
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}
/* WCAG AA: solid fills only — gold-gradient stops dipped below 4.5:1 on text. */
.btn{font-family:var(--label);letter-spacing:.05em;font-size:14px;padding:12px 18px;border-radius:10px;border:1px solid var(--gold);background:#FBF4E4;color:var(--gold-deep);text-decoration:none;cursor:pointer;display:inline-flex;align-items:center;gap:8px;transition:background 120ms ease}
.btn:hover{background:#FCF7EC}
.btn.primary{background:var(--gold-deep);color:#FFF;border-color:var(--gold-deep)}
.btn.primary:hover{background:#6E520F}
.btn.danger{background:var(--bad-soft);border-color:var(--bad);color:var(--bad)}
.btn.secondary{background:#fff;border-color:rgba(176,137,47,.34);color:var(--ink)}
details.panel{margin-top:18px;border:1px solid rgba(176,137,47,.30);border-radius:12px;background:#fff;overflow:hidden}
details.panel>summary{cursor:pointer;list-style:none;padding:14px 18px;font-family:var(--label);letter-spacing:.04em;color:var(--ink);background:#FBF7EF}
details.panel>summary::-webkit-details-marker{display:none}
details.panel>summary::after{content:"+";float:right;color:var(--gold-deep)}
details.panel[open]>summary::after{content:"\2212"}
.panel .inner{padding:16px 18px}

/* ---- Forms (verify download + issuer issuance + landing lookup) ---------- */
label{display:block;font-size:13px;color:var(--ink-soft);margin:14px 0 6px}
/* Resting field border: an empty input is white-on-white, so the border is the
   field's SOLE boundary — it must hit 1.4.11's 3:1. #9F9276 = 3.07:1 on white
   (was #D8CFC0, 1.54:1). Still a warm ink-adjacent grey, not gold. */
input,textarea,select{width:100%;padding:11px 12px;font-size:15px;border:1px solid #9F9276;border-radius:8px;font-family:var(--serif);background:#fff;color:var(--ink)}
textarea{min-height:6rem;resize:vertical}
input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid var(--gold-deep);outline-offset:1px;border-color:var(--gold)}
.field-row{display:flex;gap:16px;flex-wrap:wrap}
/* the utility that replaces ALL four inline style="flex:1 1 12rem" divs */
.field-half{flex:1 1 12rem}
.lookup{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}
.lookup input{flex:1 1 260px;font-family:var(--label);letter-spacing:.03em}
.msg{font-size:13.5px;margin-top:10px;min-height:1.2em} .msg.err{color:var(--bad)} .msg.ok{color:var(--ok)}

/* ---- §63 SOBER REGISTER (super-admin only: no frame/wash/studs/script) --- */
.sober{max-width:760px}
.sober h1,.sober h2{font-family:var(--display);color:var(--ink)}
.sober h2{font-size:1.1rem;margin:28px 0 10px;padding-bottom:8px;border-bottom:.8px solid var(--gold-soft);font-family:var(--label);letter-spacing:.12em;text-transform:uppercase;color:var(--gold-deep);font-weight:400}
table.particulars{width:100%;border-collapse:collapse;margin-top:10px}
table.particulars th,table.particulars td{text-align:left;padding:.55rem .6rem;border:.4px solid var(--gold-soft);font-size:14px}
table.particulars th{font-family:var(--label);letter-spacing:.06em;text-transform:uppercase;font-weight:400;color:var(--gold-deep);background:rgba(176,137,47,.045);width:40%}
table.particulars td .mono{font-family:"Courier New",ui-monospace,monospace}
.disclosure{margin:18px 0;padding:14px 16px;border:1px solid var(--gold-soft);background:rgba(176,137,47,.04);border-radius:8px;font-size:13.5px;color:var(--ink-soft)}
.disclosure strong{color:var(--bad)}
.badge{display:inline-block;padding:.15rem .6rem;border-radius:999px;font-family:var(--label);font-size:.8rem;letter-spacing:.06em;text-transform:uppercase;border:1px solid var(--gold-soft)}
.badge.intact{background:var(--ok-soft);color:var(--ok);border-color:#BFE0CC}
.badge.check{background:var(--bad-soft);color:var(--bad);border-color:#E7C3C0}

/* ---- Explainer / tamper micro-demo / footer ------------------------------ */
.explainer{margin-top:30px;font-size:13.5px;color:var(--ink-soft)}
.explainer h2{font-family:var(--label);font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold-deep)}
.flip{display:inline-flex;gap:6px;align-items:center;margin-top:8px;font-family:ui-monospace,monospace;font-size:12.5px}
.flip .bit{width:22px;height:22px;display:grid;place-items:center;border:1px solid var(--gold-soft);border-radius:5px;background:#fff;color:var(--ink)}
.flip .bit.changed{border-color:var(--bad);color:var(--bad);background:var(--bad-soft)}
footer.foot{margin-top:40px;padding-top:18px;border-top:1px solid rgba(176,137,47,.28);font-size:12.5px;color:var(--ink-soft)}
footer.foot .motto{font-family:var(--label);letter-spacing:.28em;text-transform:uppercase;color:var(--gold-deep)}
footer.foot a{color:var(--gold-deep)}

/* ---- Motion: ARRIVAL, SETTLE (the tumbler seating), SEAL ------------------ */
@keyframes cardrise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes studset{from{opacity:0;transform:rotate(45deg) scale(0)}to{opacity:1;transform:rotate(45deg) scale(1)}}
@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.7);opacity:.55}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes settle{0%{transform:scale(1.18);box-shadow:0 0 0 6px rgba(31,122,77,.18)}100%{transform:scale(1);box-shadow:0 0 0 0 rgba(31,122,77,0)}}

/* ---- Reduced motion: verdict fully present + final, zero motion ----------- */
@media (prefers-reduced-motion:reduce){
  *{animation:none!important;transition:none!important}
  .status.checking .dot{opacity:1}
  .verdict.valid .seal{opacity:1;height:44px;overflow:visible}
}
@media (max-width:560px){dl.grid{grid-template-columns:1fr;gap:2px 0}dl.grid dt{margin-top:8px}}`;
}
