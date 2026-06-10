/**
 * The verify portal's standalone "Daylight Examination" stylesheet — a LIGHT,
 * institutional trust stage. This sheet fully replaces the shared letterhead
 * design system ON THIS SURFACE ONLY (the issuer admin keeps @dmjone/brand);
 * the brand DNA survives in the four serif families (served same-origin from
 * /fonts/:file) and in gold, which is reserved for the EARNED seal.
 *
 * TRUST PSYCHOLOGY, evidence-led: credibility research (Fogg's Stanford web-
 * credibility studies; Cyr's cross-cultural colour-trust work; Labrecque &
 * Milne's brand-colour associations) consistently finds BLUE the most-trusted
 * hue (competence, security — the palette of banks, governments, healthcare)
 * and clean LIGHT grounds the most credible surface (transparency: nothing to
 * hide). So: cool paper-white stage, deep navy-blue ink, institutional blue
 * for examination states, GREEN strictly for confirmation, RED strictly for
 * alarm, and GOLD only where it is earned — the seal. The living background
 * is a quantum field of drifting |0⟩/|1⟩ binary glyphs (the cinema engine),
 * faint blue ink on paper, parting behind text.
 *
 * Non-negotiables encoded here:
 *  - WCAG 2.2 AAA text contrast (≥7:1) on every text/ground pair: ink
 *    #16243D ≈ 13:1 on the #F7F9FC stage; soft ink #424F66 ≈ 7.4:1; blue
 *    #224E8D ≈ 7.8:1; green #0F5132 ≈ 7.7:1; red #A02129 ≈ 7.4:1; amber
 *    #6B4E07 ≈ 7.9:1; gold label #6B500F ≈ 7.4:1. Functional strokes ≥3:1.
 *  - 44px minimum interactive targets (2.5.5 AAA).
 *  - prefers-reduced-motion (and body.still): every animation/transition off,
 *    every staged element fully present in its FINAL state; seal gate intact.
 *  - The seal-scarcity contract, verbatim where load-bearing:
 *      .hero .verdict:not(.valid) .seal{display:none}
 *    plus the bad-state glyph fill, the :has() identity demotion, and the
 *    upload file-gate exception — same selectors, relit for daylight.
 *  - Zero url() images, zero external origins, zero style=""/on*= dependence.
 *
 * String.raw, no backticks/${ in the body (CSS \ escapes survive verbatim).
 */

export function verifyCinemaCss(): string {
  return String.raw`/* ════════════════════════════════════════════════════════════════════════
   dmj.one verify — "Daylight Examination" (light institutional trust stage)
   ════════════════════════════════════════════════════════════════════════ */

/* ---- Brand faces, served same-origin (font-src 'self') ------------------ */
@font-face{font-family:"EB Garamond";font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/eb-garamond-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"EB Garamond";font-style:italic;font-weight:400;font-display:swap;src:url(/fonts/eb-garamond-latin-400-italic.woff2) format("woff2")}
@font-face{font-family:"EB Garamond";font-style:italic;font-weight:500;font-display:swap;src:url(/fonts/eb-garamond-latin-500-italic.woff2) format("woff2")}
@font-face{font-family:"EB Garamond";font-style:normal;font-weight:600;font-display:swap;src:url(/fonts/eb-garamond-latin-600-normal.woff2) format("woff2")}
@font-face{font-family:"Playfair Display";font-style:normal;font-weight:600;font-display:swap;src:url(/fonts/playfair-display-latin-600-normal.woff2) format("woff2")}
@font-face{font-family:"Playfair Display";font-style:normal;font-weight:700;font-display:swap;src:url(/fonts/playfair-display-latin-700-normal.woff2) format("woff2")}
@font-face{font-family:"Marcellus";font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/marcellus-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"Great Vibes";font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/great-vibes-latin-400-normal.woff2) format("woff2")}

/* ---- Tokens: the trust palette ------------------------------------------- */
:root{
  color-scheme:light;
  --stage:#F7F9FC;          /* cool paper white — transparency, daylight */
  --stage-2:#EEF2F8;
  --plate:#FFFFFF;          /* raised paper plates */
  --plate-2:#F2F5FA;
  --line:rgba(34,78,141,.14);
  --line-strong:rgba(34,78,141,.3);
  --line-fn:#8A99B0;        /* functional strokes, ≥3:1 on stage */
  --ink:#16243D;            /* primary text — deep navy ink, ~13:1 */
  --ink-soft:#424F66;       /* secondary text, ~7.4:1 */
  --blue:#224E8D;           /* institutional blue — links, scan, accents */
  --blue-bright:#3D6FB5;
  --blue-wash:rgba(61,111,181,.08);
  --gold:#C9A24B;           /* the seal metal (non-text) */
  --gold-bright:#E9CC7E;
  --gold-label:#6B500F;     /* small gold text, ~7.4:1 */
  --gold-line:#A8862F;      /* gold functional strokes, ≥3:1 */
  --ok:#0F5132;             /* confirmation green text, ~7.7:1 */
  --ok-core:#1F7A4D;
  --bad:#A02129;            /* alarm red text, ~7.4:1 */
  --bad-core:#C9303B;
  --warn:#6B4E07;           /* amber text, ~7.9:1 */
  --warn-core:#B08415;
  --focus:#1D4F8F;
  --serif:"EB Garamond",Georgia,serif;
  --display:"Playfair Display",Georgia,serif;
  --label:"Marcellus","EB Garamond",serif;
  --script:"Great Vibes",cursive;
  /* live vars written by the engine (safe defaults render fine without JS) */
  --mx:50vw; --my:30vh;
}
@view-transition{navigation:auto}

/* ---- Ground zero ---------------------------------------------------------- */
*,*::before,*::after{box-sizing:border-box}
html{background:var(--stage);scroll-behavior:smooth;
  font-size:clamp(13.5px,calc(10.6px + 0.74vw),18px);
  -webkit-text-size-adjust:100%}
body{margin:0;min-height:100svh;background:
    radial-gradient(120% 70% at 50% -10%,#FFFFFF 0%,transparent 60%),
    radial-gradient(90% 60% at 50% 115%,#E9EEF6 0%,transparent 65%),
    var(--stage);
  color:var(--ink);font-family:var(--serif);line-height:1.55;
  overflow-x:clip}
::selection{background:rgba(61,111,181,.22);color:#0E1B30}
/* a visible scrollbar is a trust affordance: blue-grey thumb on a light track
   (an invisible scrollbar reads as "the page does not scroll") */
html{scrollbar-color:#7E92AE #E7ECF4;scrollbar-width:thin}
::-webkit-scrollbar{width:12px;height:12px}
::-webkit-scrollbar-track{background:#E7ECF4}
::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#92A5BF,#6E83A1);border-radius:8px;
  border:3px solid #E7ECF4}
::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#7E92AE,#5C7292)}
a{color:var(--blue);text-underline-offset:.18em;text-decoration-thickness:1px}
a:hover{color:var(--blue-bright)}
:focus-visible{outline:2px solid var(--focus);outline-offset:3px;border-radius:4px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.skip{position:fixed;left:12px;top:-48px;z-index:60;background:var(--ink);color:#FFFFFF;
  font-family:var(--label);font-size:14px;letter-spacing:.08em;padding:10px 16px;border-radius:8px;
  text-decoration:none;transition:top .2s ease}
.skip:focus{top:12px}

/* ---- The stage layers (decoration only; aria-hidden, no pointer) --------- */
.stage{position:fixed;inset:0;z-index:0;width:100%;height:100%;pointer-events:none}
/* daylight vignette: a whisper of cool depth at the edges, never darkness */
.vignette{position:fixed;inset:0;z-index:1;pointer-events:none;
  background:radial-gradient(125% 95% at 50% 42%,transparent 60%,rgba(120,140,170,.1) 100%)}
.grain{position:fixed;inset:0;z-index:2;pointer-events:none;opacity:.035;mix-blend-mode:multiply}
/* the pointer light — a faint cool reading-glass that follows the hand */
body::after{content:"";position:fixed;inset:0;z-index:3;pointer-events:none;opacity:0;
  background:radial-gradient(320px 320px at var(--mx) var(--my),rgba(61,111,181,.05),transparent 70%);
  transition:opacity .6s ease}
@media (pointer:fine){body.js:not(.still)::after{opacity:1}}
/* CSS aurora — the no-GPU understudy: two faint blue blooms breathing */
body.gpu-none .stage{background:
    radial-gradient(46% 34% at 30% 30%,rgba(61,111,181,.07),transparent 70%),
    radial-gradient(38% 30% at 72% 64%,rgba(120,150,190,.06),transparent 70%)}
body.gpu-none.js:not(.still) .stage{animation:aurora 26s ease-in-out infinite alternate}
@keyframes aurora{from{background-position:0% 0%,100% 100%}to{background-position:14% 8%,86% 88%}}

/* the scroll progress hairline — pure scroll-timeline, hidden if unsupported */
.progress{display:none}
@supports (animation-timeline:scroll()){
  .progress{display:block;position:fixed;top:0;left:0;right:0;height:2px;z-index:50;
    transform-origin:0 50%;transform:scaleX(0);
    background:linear-gradient(90deg,var(--blue),var(--blue-bright));
    animation:progress-grow linear both;animation-timeline:scroll(root)}
  @keyframes progress-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
}

/* ---- Content column above the stage --------------------------------------- */
.wrap{position:relative;z-index:4}
main:focus{outline:none}

/* ════════════════════════ ABOVE THE FOLD — THE HERO ═══════════════════════ */
.hero{position:relative;min-height:100svh;display:grid;grid-template-rows:auto 1fr auto;
  padding:clamp(16px,3svh,34px) clamp(20px,5vw,52px) clamp(12px,2.2svh,24px);
  text-align:center;isolation:isolate}
/* a whisper of architecture: one hairline + four gold corner ticks (the
   certification accent — gold appears only in certifying details) */
.hero__frame{position:absolute;inset:clamp(10px,2vh,22px);border:1px solid rgba(34,78,141,.16);
  border-radius:4px;pointer-events:none;z-index:-1}
.hero__frame::before,.hero__frame::after{content:"";position:absolute;width:7px;height:7px;
  background:var(--gold);transform:rotate(45deg);opacity:.8}
.hero__frame::before{top:-4px;left:-4px;box-shadow:calc(100% + 8px) 0 0 var(--gold)}
.hero__frame::after{bottom:-4px;left:-4px;box-shadow:calc(100% + 8px) 0 0 var(--gold)}
/* two daylight shafts: cool examination light crossing a warm certification
   light — impartial scrutiny meeting the genuine article */
.hero__beams{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:-1;opacity:.9}
.hero__beams::before,.hero__beams::after{content:"";position:absolute;top:-30%;height:160%;width:34%;
  filter:blur(2px)}
.hero__beams::before{left:6%;transform:rotate(8deg);
  background:linear-gradient(105deg,transparent 30%,rgba(61,111,181,.045) 47%,rgba(61,111,181,.08) 50%,rgba(61,111,181,.045) 53%,transparent 70%)}
.hero__beams::after{right:4%;transform:rotate(-10deg);opacity:.8;
  background:linear-gradient(105deg,transparent 30%,rgba(201,162,75,.05) 47%,rgba(201,162,75,.09) 50%,rgba(201,162,75,.05) 53%,transparent 70%)}
body.js:not(.still) .hero__beams::before{animation:beam-drift 17s ease-in-out infinite alternate}
body.js:not(.still) .hero__beams::after{animation:beam-drift 23s ease-in-out infinite alternate-reverse}
@keyframes beam-drift{from{transform:rotate(8deg) translateX(-2.5%)}to{transform:rotate(6.5deg) translateX(2.5%)}}

/* (1) trustmark — the institution at the crown */
.hero .trustmark{display:flex;align-items:baseline;justify-content:center;gap:.62ch;flex-wrap:wrap;
  border:0;padding:0;view-transition-name:masthead;animation:v-fade-down .7s .1s both ease-out}
.hero .trustmark .mark{font-family:var(--display);font-weight:700;font-size:clamp(19px,2.4vw,23px);
  letter-spacing:.01em;color:var(--ink)}
.hero .trustmark .mark b{color:var(--blue);font-weight:700}
.hero .trustmark .svc{font-family:var(--label);font-size:clamp(11px,1.5vw,12.5px);letter-spacing:.24em;
  text-transform:uppercase;color:var(--ink-soft)}

/* the centre stack, set on a soft paper scrim so type never fights the
   binary field — readability is the first courtesy of a trustworthy page */
.hero__core{position:relative;align-self:center;display:flex;flex-direction:column;align-items:center;
  gap:clamp(12px,2.2svh,26px);padding:clamp(4px,1.2svh,14px) 0;perspective:1200px}
.hero__core::before{content:"";position:absolute;inset:-6% -18%;z-index:-1;pointer-events:none;
  background:radial-gradient(56% 56% at 50% 46%,rgba(247,249,252,.92),rgba(247,249,252,.62) 58%,transparent 78%)}

/* (2) the document identity — an engraved plaque in daylight. Its lines hold
   REAL depth (translateZ layers) so the pointer tilt parallaxes. */
.hero .identity{transform:rotateX(var(--tx,0deg)) rotateY(var(--ty,0deg));
  transform-style:preserve-3d;will-change:transform;transition:transform .18s ease-out;
  position:relative;padding:clamp(4px,1svh,10px) clamp(10px,2vw,26px)}
.hero .identity .eyebrow{transform:translateZ(12px)}
.hero .identity .type-title{transform:translateZ(34px)}
.hero .identity .recipient,.hero .identity .docmeta{transform:translateZ(20px)}
.hero .identity::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:12px;
  background:radial-gradient(420px 200px at var(--gx,50%) var(--gy,40%),rgba(61,111,181,.05),transparent 70%);
  opacity:0;transition:opacity .4s ease}
@media (pointer:fine){body.js:not(.still) .hero .identity:hover::after{opacity:1}}
.hero .eyebrow{font-family:var(--label);font-size:clamp(11.5px,.84rem,14px);letter-spacing:.36em;
  text-transform:uppercase;color:var(--gold-label);margin:0;animation:v-fade-in .5s .12s both ease-out}
.hero .type-title{font-family:var(--display);font-weight:700;text-transform:uppercase;
  font-size:clamp(20px,2.35rem,46px);letter-spacing:.05em;margin:.14em 0 0;line-height:1.08;color:var(--ink);
  max-width:100%;overflow-wrap:break-word;display:-webkit-box;-webkit-box-orient:vertical;
  -webkit-line-clamp:2;line-clamp:2;overflow:hidden;
  text-shadow:0 1px 0 #FFFFFF;
  animation:v-fade-up .6s .18s both ease-out}
.hero .type-title.doc-name{text-transform:none;font-size:clamp(18px,1.75rem,32px);letter-spacing:.012em;line-height:1.16;
  max-width:min(94vw,34ch);overflow-wrap:anywhere;-webkit-line-clamp:3;line-clamp:3}
.hero .recipient{margin:.75em 0 0;font-family:var(--label);font-size:clamp(15px,1.32rem,22px);
  letter-spacing:.05em;color:var(--blue);animation:v-fade-up .6s .26s both ease-out}
.hero .recipient .lbl{display:block;font-family:var(--serif);font-style:italic;font-weight:400;
  font-size:clamp(13px,1rem,16px);letter-spacing:.01em;color:var(--ink-soft);margin-bottom:.22em}
.hero .docmeta{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;
  margin:1em 0 0;font-family:var(--label);font-size:13.5px;color:var(--ink-soft);
  animation:v-fade-up .6s .26s both ease-out}
.hero .docmeta .filechip{font-size:11.5px;letter-spacing:.14em;color:var(--blue);
  border:1px solid var(--line-strong);border-radius:5px;padding:3px 8px;background:var(--blue-wash)}
.hero .docmeta .docnum .k{color:var(--ink-soft);margin-right:.5ch}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em;
  color:var(--blue);letter-spacing:.04em;overflow-wrap:anywhere}

/* (3) THE VERDICT — the moment ---------------------------------------------- */
.hero .verdict{position:relative;display:flex;flex-direction:column;align-items:center;
  gap:clamp(10px,1.6svh,18px);margin:0;max-width:min(92vw,64ch)}
/* the examination ring: a cool blue conic scan ONLY while the live re-check
   runs (body.is-checking) — clinical, impartial; gold is earned afterwards */
.hero .verdict::before{content:"";position:absolute;inset:-22px -30px;border-radius:26px;
  pointer-events:none;opacity:0;
  background:conic-gradient(from 0deg,transparent 0 78%,rgba(34,78,141,.5) 92%,transparent 100%);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  mask-composite:exclude;padding:1.5px;transition:opacity .45s ease}
body.is-checking:not(.still) .hero .verdict::before{opacity:1;animation:rite-spin 1.6s linear infinite}
@keyframes rite-spin{to{transform:rotate(1turn)}}
/* the guilloche lace — security-print engraving (banknote language), faint
   blue ink behind the verdict slot; STATIC on purpose (an ornament, never a
   spinning symbol) */
.rosette{position:absolute;left:50%;top:0;transform:translate(-50%,-32%);z-index:-1;
  width:clamp(150px,min(52vw,38svh),360px);height:auto;opacity:.16;pointer-events:none;color:var(--blue)}
.verdict.valid .rosette{color:var(--gold)}
.hero .verdict .word{display:flex;flex-direction:column;align-items:center;gap:clamp(10px,1.8svh,20px);
  margin:0;font-family:var(--display);font-weight:700;font-size:clamp(24px,2.3rem,46px);
  letter-spacing:.02em;line-height:1.06;color:var(--ink)}
.hero .verdict .word,.hero .verdict.valid .word{animation:v-fade-up .52s .1s both ease-out}
.hero .verdict .sub{max-width:40ch;margin:0;font-size:clamp(14px,1.04rem,17px);line-height:1.55;
  color:var(--ink-soft);animation:v-fade-up .52s .2s both ease-out}
/* verdict word colours: GREEN is confirmation, RED is alarm, ink is neutral */
.hero .verdict.valid #verdict-word{color:var(--ok)}
.hero .verdict.revoked #verdict-word,.hero .verdict.bad #verdict-word{color:var(--bad)}
.hero .verdict.unknown #verdict-word,.hero .verdict.unconfirmed #verdict-word{color:var(--ink)}

/* legibility floor for every hero line over the binary field */
.hero .eyebrow,.hero .recipient,.hero .docmeta,.hero .verdict .word,.hero .verdict .sub,
.hero .verdict .hardfact,.hero .verdict .compare,.hero .verdict .honesty,
.hero--landing .lead{text-shadow:0 1px 0 rgba(255,255,255,.9),0 0 14px rgba(247,249,252,.8)}

/* letter-split reveal (visual only; accessible name preserved on .word) */
#verdict-word.split .ltr{display:inline-block;white-space:pre}
body.js:not(.still) #verdict-word.split .ltr{opacity:0;transform:translateY(.42em) rotate(2deg);filter:blur(6px);
  animation:ltr-in .62s calc(var(--li) * 52ms + 120ms) both cubic-bezier(.2,.7,.2,1)}
@keyframes ltr-in{to{opacity:1;transform:none;filter:blur(0)}}

/* the hero GLYPH fills the medallion slot on BAD states (colour-independent). */
.hero .verdict .glyph{display:none}
.hero .verdict.revoked .glyph,
.hero .verdict.bad .glyph,
.hero .verdict.unknown .glyph{order:-1;display:grid;place-items:center;
  width:clamp(60px,min(22vw,15svh),148px);height:clamp(60px,min(22vw,15svh),148px);
  border-radius:50%;border:2px solid currentColor;
  font-size:clamp(30px,min(11vw,8svh),78px);line-height:1;font-family:var(--label);
  animation:glyph-in .7s .08s both cubic-bezier(.2,.8,.25,1.2)}
@keyframes glyph-in{0%{opacity:0;transform:scale(.55) rotate(-6deg)}60%{opacity:1}
  78%{transform:scale(1.05)}100%{opacity:1;transform:none}}
.hero .verdict.bad .glyph,.hero .verdict.revoked .glyph{color:var(--bad);
  background:radial-gradient(circle at 50% 38%,rgba(201,48,59,.1),transparent 72%);
  box-shadow:0 14px 34px -16px rgba(160,33,41,.45)}
.hero .verdict.unknown .glyph{color:var(--ink-soft);
  background:radial-gradient(circle at 50% 38%,rgba(110,131,161,.12),transparent 72%)}
.hero .verdict .glyph{order:-1}
.hero .verdict .seal{order:-1}
/* seal scarcity: only a valid verdict even RESERVES the slot */
.hero .verdict:not(.valid) .seal{display:none}

/* identity demotion on bad states — a forgery is never dressed in prestige */
.hero__core:has(.verdict.revoked) .identity,
.hero__core:has(.verdict.bad) .identity,
.hero__core:has(.verdict.unknown) .identity{opacity:.45;filter:grayscale(.5)}
.hero__core:has(.verdict.revoked) .type-title,
.hero__core:has(.verdict.bad) .type-title{text-decoration:line-through;
  text-decoration-color:rgba(201,48,59,.55);text-decoration-thickness:2px}
.hero__core:has(.verdict.unknown) .type-title{text-decoration:none}
/* upload file-gate exception: the record is genuine — never deface the doc
   name when the HOLDER's file mismatches; the glyph + file row carry it. */
body[data-filegate="1"] .hero__core:has(.verdict.bad) .identity{opacity:1;filter:none}
body[data-filegate="1"] .hero__core:has(.verdict.bad) .type-title{text-decoration:none}

/* supporting hero lines */
.hero .verdict .hardfact{margin:0;max-width:46ch;font-family:var(--label);
  font-size:clamp(12.5px,.9rem,14.5px);letter-spacing:.05em;color:var(--blue);
  line-height:1.55;animation:v-fade-up .52s .3s both ease-out}
.hero .verdict .compare{margin:0;max-width:44ch;font-family:var(--serif);font-style:italic;
  font-size:clamp(13px,.97rem,15.5px);color:var(--ink);line-height:1.55;
  animation:v-fade-up .52s .38s both ease-out}
.hero .verdict .honesty{margin:0;max-width:52ch;font-family:var(--serif);
  font-size:clamp(12.5px,.9rem,14.5px);line-height:1.55;color:var(--ink-soft);
  animation:v-fade-in .52s .46s both ease-out}

/* ---- THE SEAL — the one gold object, struck into daylight ----------------- */
.verdict .seal{--d:clamp(70px,min(26vw,19svh),200px);--sx:36%;--sy:30%;position:relative;
  width:var(--d);height:var(--d);min-height:var(--d);flex:0 0 auto;overflow:visible;
  border-radius:50%;display:grid;place-items:center;
  background:
    radial-gradient(58% 58% at var(--sx) var(--sy),#FBEFC8 0%,transparent 56%),
    radial-gradient(120% 120% at 70% 82%,#7A5C14 0%,transparent 60%),
    conic-gradient(from 210deg,#C9A24B,#8A6A1C 22%,#EBD088 40%,#9B7822 58%,#D8B45E 74%,#876616 88%,#C9A24B);
  box-shadow:
    inset 0 2px 3px rgba(255,247,220,.9),
    inset 0 -3px 7px rgba(75,55,12,.6),
    inset 0 0 0 1px rgba(110,82,15,.35),
    0 1px 0 rgba(255,255,255,.8),
    0 22px 44px -20px rgba(64,52,18,.5),
    0 6px 18px -8px rgba(138,106,28,.35);
  opacity:0;transform:scale(.6);transition:opacity .36s ease,transform .36s ease}
.verdict .seal::before{content:"";position:absolute;inset:9%;border-radius:50%;
  box-shadow:inset 0 1px 2px rgba(75,55,12,.6),inset 0 -1px 1px rgba(255,247,220,.55),0 0 0 1px rgba(255,247,220,.25)}
/* halo behind the struck seal — daylight catching the metal */
.verdict .seal::after{content:"";position:absolute;inset:-26%;border-radius:50%;z-index:-1;opacity:0;
  background:radial-gradient(closest-side,rgba(233,204,126,.4),rgba(201,162,75,.1) 58%,transparent 75%)}
.seal__ring{position:absolute;inset:0;width:100%;height:100%}
.seal__ring text{font-family:var(--label);font-size:6.4px;letter-spacing:1.15px;text-transform:uppercase;fill:#52400E}
.seal__core{position:relative;display:grid;place-items:center;gap:2px;z-index:2}
.seal__script{font-family:var(--script);font-size:calc(var(--d) * .26);line-height:.9;color:#4E3C0B;
  text-shadow:0 1px 0 rgba(255,247,220,.6),0 -1px 1px rgba(75,55,12,.5);margin-top:-.06em}
.seal__star{font-size:calc(var(--d) * .10);color:#5F490F;line-height:1;margin-bottom:-.04em;
  text-shadow:0 1px 0 rgba(255,247,220,.55)}
.seal__flash{position:absolute;inset:-8%;border-radius:50%;border:2px solid var(--gold);
  opacity:0;z-index:-1;pointer-events:none}
/* EARNED: a live VALID strikes the seal; the halo blooms; one flash ring */
.verdict.valid.sealed .seal{height:var(--d);opacity:1;overflow:visible;
  animation:v-stamp .78s cubic-bezier(.2,.85,.25,1.55) both}
.verdict.valid.sealed .seal::after{opacity:1;transition:opacity .9s .25s ease}
.verdict.valid.sealed .seal__flash{animation:v-flash .75s .06s ease-out both}
body.js:not(.still) .verdict.valid.sealed .seal{animation:v-stamp .78s cubic-bezier(.2,.85,.25,1.55) both,
  seal-breathe 9s 2.2s ease-in-out infinite}
/* the struck seal floats alive in true 3D: a slow precession in the light */
@keyframes seal-breathe{
  0%,100%{transform:perspective(700px) translateY(0) rotateX(0deg) rotateY(0deg) scale(1)}
  30%{transform:perspective(700px) translateY(-3px) rotateX(2.4deg) rotateY(-2.8deg) scale(1.012)}
  65%{transform:perspective(700px) translateY(-1px) rotateX(-1.8deg) rotateY(2.2deg) scale(1.008)}
}

/* (4) scroll cue */
.scrollcue{display:inline-flex;flex-direction:column;align-items:center;gap:6px;justify-self:center;
  font-family:var(--label);font-size:12.5px;letter-spacing:.28em;text-transform:uppercase;
  padding:10px 18px;margin:-6px 0 0;min-height:44px;color:var(--blue);text-decoration:none;
  animation:v-fade-in .7s .8s both ease-out}
.scrollcue .chev{width:14px;height:14px;border-right:1.5px solid var(--blue);
  border-bottom:1.5px solid var(--blue);transform:rotate(45deg)}
body.js:not(.still) .scrollcue .chev{animation:v-nudge 1.9s 1.6s ease-in-out infinite}
.scrollcue:hover{color:var(--ink)}
.scrollcue:hover .chev{border-color:var(--ink)}

/* ═══════════════════ BELOW THE FOLD — THE DESCENT ═════════════════════════ */
/* the proof column floats on a translucent paper sheet: the field stays
   alive at the edges while every paragraph sits on quiet, readable ground */
.proof{position:relative;max-width:820px;margin:0 auto;
  padding:clamp(44px,9vh,110px) clamp(20px,5vw,32px) 28px}
.proof::before{content:"";position:absolute;inset:0 -8%;z-index:-1;pointer-events:none;
  background:linear-gradient(180deg,transparent,rgba(247,249,252,.82) 70px,rgba(247,249,252,.82) calc(100% - 40px),rgba(247,249,252,.55));
  -webkit-mask:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);
  mask:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
.proof__intro{text-align:center;margin-bottom:clamp(34px,6vh,64px)}
.proof__intro .ek{font-family:var(--label);font-size:12.5px;letter-spacing:.3em;text-transform:uppercase;
  color:var(--gold-label);margin:0}
.proof__intro h2{font-family:var(--display);font-weight:600;font-size:clamp(23px,3.4vw,32px);
  letter-spacing:.02em;color:var(--ink);margin:10px 0 0}
.block-h{font-family:var(--label);font-size:13px;letter-spacing:.2em;text-transform:uppercase;
  color:var(--gold-label);margin:0 0 16px}

/* ---- the status badge (white glass plate) --------------------------------- */
.status{display:flex;align-items:flex-start;gap:14px;padding:16px 18px;border-radius:14px;
  border:1px solid var(--line-strong);background:linear-gradient(180deg,rgba(255,255,255,.82),rgba(244,247,251,.82));
  backdrop-filter:blur(14px) saturate(1.15);-webkit-backdrop-filter:blur(14px) saturate(1.15);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.95),0 1px 0 rgba(255,255,255,.6),
    0 22px 48px -30px rgba(31,51,86,.4),0 6px 16px -10px rgba(31,51,86,.18)}
.status .dot{flex:0 0 auto;width:12px;height:12px;border-radius:50%;margin-top:5px;
  background:var(--line-fn);box-shadow:0 0 0 3px rgba(110,131,161,.15)}
.status .txt{display:grid;gap:3px}
.status .txt b{font-family:var(--label);font-weight:400;font-size:14px;letter-spacing:.16em;color:var(--ink)}
.status .txt span{font-size:14.5px;line-height:1.55;color:var(--ink-soft)}
.status.valid{border-color:rgba(31,122,77,.4)}
.status.valid .dot{background:var(--ok-core);box-shadow:0 0 0 3px rgba(31,122,77,.18)}
.status.valid .txt b{color:var(--ok)}
.status.bad,.status.revoked{border-color:rgba(201,48,59,.4)}
.status.bad .dot,.status.revoked .dot{background:var(--bad-core);box-shadow:0 0 0 3px rgba(201,48,59,.15)}
.status.bad .txt b,.status.revoked .txt b{color:var(--bad)}
.status.unknown .dot{background:var(--line-fn)}
.status.unconfirmed{border-color:rgba(176,132,21,.45)}
.status.unconfirmed .dot{background:var(--warn-core);box-shadow:0 0 0 3px rgba(176,132,21,.18)}
.status.unconfirmed .txt b{color:var(--warn)}
.status.checking{border-color:rgba(34,78,141,.4)}
.status.checking .dot{background:var(--blue);box-shadow:0 0 0 3px rgba(34,78,141,.16)}
.status.checking .txt b{color:var(--blue)}
body.js:not(.still) .status.checking .dot{animation:dot-pulse 1.05s ease-in-out infinite}
@keyframes dot-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.7);opacity:.55}}

/* ---- the check constellation ---------------------------------------------- */
.checks{list-style:none;margin:18px 0 0;padding:0;display:grid;position:relative}
.checks li{position:relative;display:grid;grid-template-columns:30px 1fr;gap:0 16px;align-items:start;
  padding:13px 4px 13px 8px;font-size:15.5px;line-height:1.5;color:var(--ink)}
/* the connecting thread */
.checks li::before{content:"";position:absolute;left:22px;top:0;bottom:0;width:1px;
  background:linear-gradient(180deg,transparent,var(--line-strong) 18%,var(--line-strong) 82%,transparent)}
.checks li:first-child::before{top:50%}
.checks li:last-child::before{bottom:50%}
/* the node — a 3D porcelain bead: lit top-left, recessed seat, contact shadow */
.checks .ic{position:relative;z-index:1;width:29px;height:29px;margin-top:-2px;border-radius:50%;
  border:1.5px solid var(--line-fn);
  background:radial-gradient(120% 120% at 32% 26%,#FFFFFF 0%,#EDF1F7 52%,#DCE3EE 100%);
  box-shadow:0 3px 7px -2px rgba(31,51,86,.3),inset 0 1px 1px rgba(255,255,255,.95),inset 0 -2px 4px rgba(31,51,86,.12);
  display:grid;place-items:center;font-size:13px;line-height:1;font-family:var(--label);color:transparent}
.checks .ic::after{content:"";width:7px;height:7px;border-radius:50%;background:var(--line-fn);
  transition:transform .3s ease,background .3s ease,box-shadow .3s ease}
.checks li.run .ic{border-color:rgba(34,78,141,.5)}
.checks li.run .ic::after{background:var(--blue)}
body.js:not(.still) .checks li.run .ic::after{animation:dot-pulse 1s ease-in-out infinite}
.checks li.pass .ic{border-color:rgba(31,122,77,.55);color:var(--ok)}
.checks li.pass .ic::after{content:"✓";width:auto;height:auto;border-radius:0;background:none;
  font-size:14px;color:var(--ok)}
.checks li.fail .ic{border-color:rgba(201,48,59,.6);color:var(--bad)}
.checks li.fail .ic::after{content:"✕";width:auto;height:auto;border-radius:0;background:none;
  font-size:13px;color:var(--bad)}
.checks li.warn .ic{border-color:rgba(176,132,21,.55)}
.checks li.warn .ic::after{content:"◌";width:auto;height:auto;border-radius:0;background:none;
  font-size:14px;color:var(--warn)}
/* ignition flash when a node lights */
body.js:not(.still) .checks li.lit .ic{animation:node-ignite .55s ease-out both}
@keyframes node-ignite{0%{box-shadow:0 0 0 0 rgba(34,78,141,.35)}100%{box-shadow:0 0 0 16px rgba(34,78,141,0)}}
.checks li.pass{color:var(--ink)}
.checks li.fail{color:var(--bad)}
.checks li.warn{color:var(--warn)}
.checks li.fail span:not(.ic),.checks li.warn span:not(.ic){font-weight:600}

/* ---- the upload file-gate (the scanner) ----------------------------------- */
.filecheck{margin-top:22px;padding:20px;border-radius:16px;border:1px solid var(--line-strong);
  background:linear-gradient(180deg,rgba(255,255,255,.8),rgba(244,247,251,.85));
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.95),0 20px 44px -30px rgba(31,51,86,.35)}
/* IN THE HERO (upload pages): the gate is the one action and lives in the
   first view — compact white-glass instrument under the verdict, the same
   prominence the landing gives its lookup plate */
.hero__core .filecheck{width:min(100%,640px);margin-top:clamp(2px,.8svh,10px);text-align:left;
  padding:clamp(12px,1.8svh,18px) clamp(14px,2.2vw,20px);
  animation:v-fade-up .56s .4s both ease-out}
.hero__core .filecheck .fc-lead{font-size:clamp(14.5px,1.04rem,17px);margin-bottom:4px}
.hero__core .filecheck .fc-why{font-size:clamp(12.5px,.88rem,14px);margin-bottom:10px;max-width:none}
.hero__core .fc-drop{padding:clamp(12px,2svh,20px) 14px;gap:9px}
.hero__core .filecheck .fc-note{font-size:12.5px;margin-top:9px;line-height:1.45}
.hero__core .filecheck .fc-msg{margin-top:7px}
@media (max-height:880px){
  .hero__core .filecheck{padding:10px 14px}
  .hero__core .filecheck .fc-why{font-size:12.5px;margin-bottom:8px}
  .hero__core .fc-drop{padding:10px 12px;gap:7px}
  .hero__core .filecheck .fc-note{font-size:12px;margin-top:7px}
}
@media (max-height:620px){
  .hero__core .filecheck .fc-why,.hero__core .filecheck .fc-note{display:none}
}
.filecheck .fc-lead{font-family:var(--display);font-weight:600;font-size:clamp(17px,1.2rem,20px);
  color:var(--ink);margin:0 0 6px}
.filecheck .fc-why{font-size:14.5px;line-height:1.55;color:var(--ink-soft);margin:0 0 14px}
/* the dropzone is a RECESSED paper tray: the one place that invites
   something to be placed INTO it */
.fc-drop{position:relative;display:grid;gap:12px;justify-items:center;padding:26px 18px;border-radius:12px;
  border:1.5px dashed var(--line-fn);background:rgba(231,237,245,.6);overflow:hidden;
  box-shadow:inset 0 3px 10px rgba(31,51,86,.12),inset 0 -1px 0 rgba(255,255,255,.8);
  transition:border-color .25s ease,background .25s ease,box-shadow .25s ease}
.fc-drop.over{border-color:var(--blue);background:rgba(61,111,181,.08);
  box-shadow:inset 0 3px 10px rgba(31,51,86,.1),inset 0 0 0 2px rgba(34,78,141,.25)}
/* the scan beam sweeps the dropzone while the file is verified — COOL blue
   examination light (the lab); gold is earned, not spent */
.fc-drop::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;
  background:linear-gradient(180deg,transparent 0%,rgba(61,111,181,.1) 48%,rgba(61,111,181,.22) 50%,rgba(61,111,181,.1) 52%,transparent 100%);
  background-size:100% 220%;background-position:0 -60%}
body.js:not(.still) .fc-drop.scanning::after{opacity:1;animation:scanbeam 1.3s linear infinite}
@keyframes scanbeam{from{background-position:0 -60%}to{background-position:0 160%}}
.fc-cta{font-family:var(--label);font-size:15px;letter-spacing:.04em;color:var(--ink);cursor:pointer;
  min-height:44px;display:grid;place-items:center}
.fc-input{font-size:14px;color:var(--ink-soft);max-width:100%}
.fc-input::file-selector-button{font-family:var(--label);font-size:13.5px;letter-spacing:.04em;
  color:var(--blue);background:#FFFFFF;border:1px solid var(--line-strong);border-radius:8px;
  padding:9px 14px;margin-right:12px;cursor:pointer;min-height:40px}
.filecheck .fc-note{font-size:13.5px;line-height:1.55;color:var(--ink-soft);margin:12px 0 0}
.filecheck .fc-msg{font-size:14.5px;line-height:1.5;margin:10px 0 0;min-height:1.4em;color:var(--ink)}
.filecheck .fc-msg.ok{color:var(--ok)}
.filecheck .fc-msg.err{color:var(--bad)}

/* ---- the three worlds (scroll chapters) ----------------------------------- */
.worlds{list-style:none;margin:clamp(40px,7vh,72px) 0 0;padding:0;display:grid;gap:clamp(30px,6vh,56px);
  counter-reset:world}
/* each world is a 3D PORCELAIN-GLASS SLAB: preserve-3d so its chip, art and
   fact lines float at different depths and parallax while the slab rises out
   of the page in perspective. overflow stays visible — clipping would force
   the 3D context flat. Hover lifts via the individual translate property so
   it composes with (never fights) the animation-held transform. */
.world{position:relative;display:grid;gap:18px;padding:clamp(22px,3.5vw,34px);border-radius:18px;
  border:1px solid var(--line);background:linear-gradient(165deg,rgba(255,255,255,.85),rgba(242,246,251,.9));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.95),0 1px 0 rgba(255,255,255,.5),
    0 30px 60px -42px rgba(31,51,86,.45),0 10px 24px -16px rgba(31,51,86,.2);
  transform-style:preserve-3d;translate:0 0;transition:translate .45s cubic-bezier(.2,.7,.2,1),box-shadow .45s ease}
.world::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:radial-gradient(90% 70% at 18% 0%,rgba(61,111,181,.06),transparent 60%)}
/* the specular glass rim: a 1px gradient ring (light from the top-left) */
.world::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;padding:1px;
  background:linear-gradient(135deg,rgba(255,255,255,.95),rgba(255,255,255,.2) 34%,transparent 58%,rgba(61,111,181,.18));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  mask-composite:exclude}
@media (pointer:fine){
  body.js:not(.still) .world:hover{translate:0 -5px;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.95),0 1px 0 rgba(255,255,255,.6),
      0 44px 84px -46px rgba(31,51,86,.5),0 16px 36px -18px rgba(31,51,86,.25),0 0 0 1px rgba(61,111,181,.12)}
}
/* the floating depth layers */
.world__num{transform:translateZ(30px)}
.world__title{transform:translateZ(22px)}
.world__copy{transform:translateZ(10px)}
.world__art{transform:translateZ(16px)}
.world__fact{transform:translateZ(26px)}
.world__head{display:flex;align-items:baseline;gap:14px;transform-style:preserve-3d}
.world__num{font-family:var(--label);font-size:12.5px;letter-spacing:.22em;color:var(--blue);
  border:1px solid var(--line-strong);border-radius:999px;padding:7px 13px;background:var(--blue-wash)}
.world__title{font-family:var(--display);font-weight:600;font-size:clamp(19px,1.5rem,26px);
  letter-spacing:.02em;color:var(--ink);margin:0}
.world__copy{font-size:clamp(14.5px,1.02rem,16.5px);line-height:1.6;color:var(--ink-soft);margin:0;max-width:62ch}
.world__copy strong{color:var(--ink)}
.world__fact{display:flex;align-items:center;gap:10px;font-family:var(--label);font-size:13.5px;
  letter-spacing:.06em;margin:0}
.world__fact .st{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
.world__fact.pass{color:var(--ok)} .world__fact.pass .st{background:var(--ok-core);box-shadow:0 0 0 3px rgba(31,122,77,.15)}
.world__fact.warn{color:var(--warn)} .world__fact.warn .st{background:var(--warn-core);box-shadow:0 0 0 3px rgba(176,132,21,.15)}
.world__fact.fail{color:var(--bad)} .world__fact.fail .st{background:var(--bad-core)}
.world__fact.idle{color:var(--ink-soft)} .world__fact.idle .st{background:var(--line-fn)}

/* the set pieces (inline SVG, crisp + printable) */
.world__art{width:100%;max-width:560px;justify-self:center;margin-top:4px}
.world__art svg{width:100%;height:auto;display:block}
.art-line{stroke:var(--line-fn);stroke-width:1;fill:none}
.art-line--soft{stroke:rgba(110,131,161,.4)}
.art-node{fill:#FFFFFF;stroke:var(--line-fn);stroke-width:1}
.art-node--lit{fill:#EAF1FA;stroke:var(--blue);stroke-width:1.4}
.art-glow{fill:var(--blue)}
.art-text{font-family:var(--label);font-size:7.5px;letter-spacing:.12em;fill:var(--blue);text-transform:uppercase}
.art-text--dim{fill:var(--ink-soft)}
.art-text--big{font-size:10px;fill:var(--ink)}
.art-chain-link{stroke:var(--blue);stroke-width:1.6;fill:none;stroke-dasharray:4 3}
.art-anchor--ok .art-anchor-dot{fill:var(--ok-core)}
.art-anchor--pending .art-anchor-dot{fill:var(--warn-core)}
body.js:not(.still) .art-anchor--pending .art-anchor-dot{animation:dot-pulse 1.6s ease-in-out infinite}
.art-hand{stroke:var(--blue);stroke-width:1.8;stroke-linecap:round}
.art-hand--minute{stroke-width:1.2}
.art-tick{stroke:var(--line-fn);stroke-width:1}
.art-dial{fill:none;stroke:var(--line-strong);stroke-width:1.2}

/* lattice draw-on (scroll-driven where supported). Valid entry/cover bounds —
   inverted view() insets left the timeline window empty, which could hold
   elements at their from-frame on some engines (the "page seems to end early /
   cannot scroll to the bottom" bug). */
.art-draw{stroke-dasharray:520;stroke-dashoffset:0}
@supports (animation-timeline:view()){
  body.js:not(.still) .art-draw{animation:art-draw-in both linear;
    animation-timeline:view();animation-range:entry 10% cover 45%}
  @keyframes art-draw-in{from{stroke-dashoffset:520}to{stroke-dashoffset:0}}
}

/* SCROLL-DRIVEN 3D REVEALS: each block rises out of the page in true
   perspective and settles flat — finished well before mid-viewport, so a
   reveal can never strand content invisible at the bottom. The no-JS /
   unsupported / reduced-motion default is FULLY VISIBLE. */
.reveal{opacity:1;transform:none}
@supports (animation-timeline:view()){
  body.js:not(.still) .reveal{animation:reveal-3d both cubic-bezier(.2,.7,.2,1);
    animation-timeline:view();animation-range:entry 5% entry 88%}
  @keyframes reveal-3d{
    from{opacity:0;transform:perspective(1100px) rotateX(7deg) translateY(44px) scale(.985)}
    to{opacity:1;transform:perspective(1100px) rotateX(0deg) translateY(0) scale(1)}
  }
}
@supports not (animation-timeline:view()){
  body.js:not(.still) .reveal{opacity:0;transform:perspective(1100px) rotateX(6deg) translateY(28px);
    transition:opacity .7s ease,transform .8s cubic-bezier(.2,.7,.2,1)}
  body.js:not(.still) .reveal.in{opacity:1;transform:perspective(1100px) rotateX(0deg) translateY(0)}
}

/* ---- facts, trust, actions ------------------------------------------------ */
.facts{margin-top:clamp(38px,6.5vh,60px)}
dl.grid{display:grid;grid-template-columns:minmax(120px,auto) 1fr;gap:1px;margin:0;
  border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--line);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 22px 48px -34px rgba(31,51,86,.4)}
dl.grid dt{font-family:var(--label);font-size:13.5px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--gold-label);padding:13px 16px;background:rgba(244,247,251,.92)}
dl.grid dd{margin:0;font-size:15px;line-height:1.5;color:var(--ink);padding:13px 16px;
  background:rgba(255,255,255,.85);overflow-wrap:anywhere}
.pill{display:inline-block;font-family:var(--label);font-size:12.5px;letter-spacing:.14em;
  padding:5px 12px;border-radius:999px;border:1px solid}
.pill.valid{color:var(--ok);border-color:rgba(31,122,77,.5);background:rgba(31,122,77,.08)}
.pill.revoked,.pill.bad{color:var(--bad);border-color:rgba(201,48,59,.5);background:rgba(201,48,59,.07)}
.pill.unknown{color:var(--ink-soft);border-color:var(--line-strong);background:rgba(110,131,161,.08)}

.trust{margin-top:clamp(32px,5vh,48px);font-size:14.5px;line-height:1.62;color:var(--ink-soft);
  border-left:2px solid var(--gold-line);padding-left:16px}
.trust strong{color:var(--ink)}
/* the conditional timestamp line: selected via its aria-label so the class
   token "trust-ts" appears in the document ONLY when the line itself does
   (the absence of that token is a test-pinned honesty signal) */
.trust[aria-label="Trusted timestamp"]{border-left-color:rgba(31,122,77,.55)}

.actions{margin-top:clamp(30px,5vh,44px);display:flex;flex-wrap:wrap;gap:12px}
/* BUTTONS are extruded 3D instruments: a real bottom face (the bevel) that
   compresses when pressed. Press uses the individual translate/scale
   properties so it composes with the magnetic transform. */
.btn{--magx:0px;--magy:0px;position:relative;display:inline-flex;align-items:center;justify-content:center;
  min-height:46px;padding:12px 22px;border-radius:11px;border:1px solid var(--line-strong);
  font-family:var(--label);font-size:14.5px;letter-spacing:.06em;text-decoration:none;cursor:pointer;
  color:var(--blue);background:linear-gradient(180deg,#FFFFFF,#F0F4F9);
  transform:translate(var(--magx),var(--magy));translate:0 0;scale:1;
  box-shadow:0 3px 0 rgba(110,131,161,.45),0 10px 22px -12px rgba(31,51,86,.35),inset 0 1px 0 rgba(255,255,255,.95);
  transition:transform .25s cubic-bezier(.2,.7,.2,1.4),translate .16s ease,scale .16s ease,
    box-shadow .16s ease,background .25s ease,color .25s ease,border-color .25s ease;
  overflow:hidden}
.btn:hover{color:var(--ink);border-color:var(--blue);
  background:linear-gradient(180deg,#FFFFFF,#EAF0F8)}
.btn:active{translate:0 2px;scale:.985;
  box-shadow:0 1px 0 rgba(110,131,161,.45),0 4px 10px -8px rgba(31,51,86,.35),inset 0 1px 0 rgba(255,255,255,.8)}
.btn.primary{color:#FFFFFF;border-color:transparent;font-weight:600;
  background:linear-gradient(160deg,#2E63AC,#1D4F8F 58%,#173F73);
  box-shadow:0 4px 0 #122F55,0 16px 32px -16px rgba(29,79,143,.5),inset 0 1px 0 rgba(255,255,255,.25)}
.btn.primary:hover{background:linear-gradient(160deg,#3D6FB5,#27598F 58%,#1D4A7E)}
.btn.primary:active{translate:0 3px;scale:.985;
  box-shadow:0 1px 0 #122F55,0 6px 14px -10px rgba(29,79,143,.4),inset 0 1px 0 rgba(255,255,255,.15)}
/* sheen sweep on hover (fine pointers, motion allowed) */
.btn::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;
  background:linear-gradient(115deg,transparent 32%,rgba(255,255,255,.45) 50%,transparent 68%);
  transform:translateX(-70%)}
@media (pointer:fine){
  body.js:not(.still) .btn:hover::after{opacity:1;animation:sheen .9s ease both}
}
@keyframes sheen{from{transform:translateX(-70%)}to{transform:translateX(70%)}}
.action-glosses{margin:14px 0 0;display:grid;grid-template-columns:auto 1fr;gap:5px 12px;
  font-size:13.5px;line-height:1.55;color:var(--ink-soft)}
.action-glosses dt{font-family:var(--label);letter-spacing:.05em;color:var(--gold-label)}
.action-glosses dd{margin:0}

/* ---- the recipient panel (password ritual) -------------------------------- */
.panel{margin-top:20px;border:1px solid var(--line-strong);border-radius:16px;overflow:hidden;
  background:linear-gradient(180deg,rgba(255,255,255,.85),rgba(244,247,251,.9));
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.95),0 22px 50px -34px rgba(31,51,86,.4)}
.panel summary{list-style:none;cursor:pointer;padding:17px 20px;font-family:var(--label);
  font-size:15px;letter-spacing:.05em;color:var(--ink);display:flex;align-items:center;gap:12px;min-height:44px}
.panel summary::-webkit-details-marker{display:none}
.panel summary::before{content:"";width:9px;height:9px;border-right:1.5px solid var(--blue);
  border-bottom:1.5px solid var(--blue);transform:rotate(-45deg);transition:transform .3s ease;flex:0 0 auto}
.panel[open] summary::before{transform:rotate(45deg)}
.panel .inner{padding:6px 20px 22px}
.panel label{display:block;font-family:var(--label);font-size:13.5px;letter-spacing:.08em;
  color:var(--ink-soft);margin:8px 0 8px}
.panel input[type="password"]{width:100%;min-height:46px;padding:12px 14px;border-radius:10px;
  border:1px solid var(--line-fn);background:#FFFFFF;color:var(--ink);
  font-size:16px;letter-spacing:.06em;box-shadow:inset 0 2px 4px rgba(31,51,86,.08)}
.panel input[type="password"]:focus{border-color:var(--blue);outline:none;
  box-shadow:inset 0 2px 4px rgba(31,51,86,.06),0 0 0 3px rgba(34,78,141,.15)}
.panel .actions{margin-top:14px}
.msg{font-size:14px;line-height:1.55;color:var(--ink-soft);margin:10px 0 0;min-height:1.3em}
.msg.ok{color:var(--ok)}
.msg.err{color:var(--bad)}

/* ---- explainer + the bit flip --------------------------------------------- */
.explainer{margin-top:clamp(38px,6.5vh,60px)}
.explainer p{font-size:14.5px;line-height:1.62;color:var(--ink-soft);margin:0 0 12px;max-width:68ch}
.explainer strong{color:var(--ink)}
.flip{display:flex;align-items:center;gap:7px;font-family:ui-monospace,Menlo,Consolas,monospace;
  font-size:14px;color:var(--ink-soft)}
.flip .bit{display:grid;place-items:center;width:30px;height:34px;border-radius:7px;
  border:1px solid var(--line-strong);background:#FFFFFF;color:var(--blue);
  box-shadow:0 2px 0 rgba(110,131,161,.3),inset 0 1px 0 rgba(255,255,255,.9)}
.flip .bit.changed{border-color:rgba(201,48,59,.6);color:var(--bad);background:rgba(201,48,59,.06)}
body.js:not(.still) .flip .bit.changed{animation:bit-blink 2.6s ease-in-out infinite}
@keyframes bit-blink{0%,72%,100%{opacity:1}82%{opacity:.35}}

/* ---- footer ---------------------------------------------------------------- */
.foot{position:relative;z-index:4;max-width:820px;margin:0 auto;
  padding:26px clamp(20px,5vw,32px) 40px;text-align:center;
  font-size:13.5px;line-height:1.7;color:var(--ink-soft);border-top:1px solid var(--line)}
.foot .motto{font-style:italic;color:var(--gold-label)}

/* ════════════════════════ THE LANDING VARIANT ═════════════════════════════ */
.hero--landing .hero__core{max-width:680px;margin-inline:auto;gap:clamp(12px,2svh,24px)}
.hero--landing .type-title{font-size:clamp(30px,3rem,58px);letter-spacing:.015em;text-transform:none;
  -webkit-line-clamp:3;line-clamp:3}
.hero--landing .lead{font-family:var(--serif);font-style:italic;font-size:clamp(15px,1.14rem,19px);
  line-height:1.55;color:var(--ink-soft);max-width:46ch;margin:0;animation:v-fade-up .56s .22s both ease-out}
.hero--landing .honesty{max-width:52ch;font-family:var(--serif);font-size:clamp(12.5px,.9rem,14.5px);
  line-height:1.55;color:var(--ink-soft);margin:0;animation:v-fade-in .52s .5s both ease-out}

/* the lookup instrument: white glass over the living field, with true depth —
   the label, entry row and hint float at different Z so the tilt parallaxes */
.lookup-plate{--tx:0deg;--ty:0deg;position:relative;width:min(100%,580px);margin-top:clamp(6px,1.4svh,16px);text-align:left;
  border:1px solid var(--line-strong);border-radius:16px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.95),0 30px 64px -36px rgba(31,51,86,.45),0 10px 26px -14px rgba(31,51,86,.2);
  padding:clamp(16px,2.4svh,24px) clamp(16px,2.6vw,24px);
  transform:perspective(1100px) rotateX(var(--tx)) rotateY(var(--ty));transform-style:preserve-3d;
  transition:transform .18s ease-out;animation:v-fade-up .56s .32s both ease-out}
/* the glass pane lives on ::before — backdrop-filter is a grouping property
   that would flatten the 3D context if it sat on the plate itself */
.lookup-plate::before{content:"";position:absolute;inset:0;border-radius:inherit;
  background:linear-gradient(180deg,rgba(255,255,255,.85),rgba(243,246,251,.88));
  backdrop-filter:blur(14px) saturate(1.15);-webkit-backdrop-filter:blur(14px) saturate(1.15);
  transform:translateZ(-2px)}
.lookup-plate .lp-label{transform:translateZ(20px)}
.lookup-plate .lp-row{transform:translateZ(30px);transform-style:preserve-3d}
.lookup-plate .lp-hint{transform:translateZ(10px)}
.lookup-plate .lp-label{display:block;font-family:var(--label);font-size:12px;
  letter-spacing:.24em;text-transform:uppercase;color:var(--gold-label);margin:0 0 9px}
.lookup-plate .lp-row{display:flex;gap:10px;flex-wrap:wrap}
.lookup-plate input{flex:1 1 200px;min-width:0;min-height:46px;font-family:var(--label);letter-spacing:.07em;
  text-transform:uppercase;font-size:clamp(16px,1.05rem,17.5px);padding:12px 14px;border-radius:10px;
  border:1px solid var(--line-fn);background:#FFFFFF;color:var(--ink);
  box-shadow:inset 0 2px 5px rgba(31,51,86,.1)}
.lookup-plate input:focus{border-color:var(--blue);outline:none;
  box-shadow:inset 0 2px 5px rgba(31,51,86,.08),0 0 0 3px rgba(34,78,141,.15)}
.lookup-plate input::placeholder{color:var(--ink-soft);opacity:1;font-family:var(--serif);
  font-style:italic;letter-spacing:.04em;text-transform:none}
.lookup-plate .lp-go{min-height:46px;font-size:15.5px;letter-spacing:.08em;padding:12px 28px;border-radius:10px}
.lookup-plate .lp-hint{font-family:var(--serif);font-size:clamp(13px,.92rem,14.5px);line-height:1.55;
  color:var(--ink-soft);margin:11px 0 0}
/* the rejected-lookup explanation: visible, honest, never a silent bounce */
.lookup-plate .lp-error{font-family:var(--serif);font-size:clamp(13px,.94rem,14.5px);line-height:1.5;
  color:var(--bad);margin:10px 0 0;padding:10px 13px;border-radius:9px;
  border:1px solid rgba(201,48,59,.55);border-left:3px solid var(--bad-core);
  background:rgba(201,48,59,.07)}
.lookup-plate .lp-error strong{font-weight:600}

/* landing method blocks ride the same .worlds chapter styling */
.ways{margin-top:clamp(32px,5vh,48px)}
.ways ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.ways li{font-size:clamp(14.5px,1.02rem,16.5px);line-height:1.55;color:var(--ink-soft)}
.ways li b{font-family:var(--label);font-weight:400;font-size:13px;letter-spacing:.12em;
  text-transform:uppercase;color:var(--blue);margin-right:.35ch}

/* ════════════════════════ MOTION PRIMITIVES ═══════════════════════════════ */
/* entrances animate the individual translate property, NEVER transform — the
   static transform channel carries the 3D layers (tilt, translateZ, plate
   perspective) and a both-fill transform animation would hold it dead. */
@keyframes v-fade-down{from{opacity:0;translate:0 -12px}to{opacity:1;translate:0 0}}
@keyframes v-fade-up{from{opacity:0;translate:0 16px}to{opacity:1;translate:0 0}}
@keyframes v-fade-in{from{opacity:0}to{opacity:1}}
@keyframes v-stamp{
  0%{opacity:0;transform:translateY(-44px) scale(1.6) rotate(-9deg)}
  55%{opacity:1}
  70%{transform:translateY(0) scale(.92) rotate(0deg)}
  84%{transform:scale(1.04)}
  100%{opacity:1;transform:translateY(0) scale(1) rotate(0deg)}
}
@keyframes v-flash{0%{opacity:0;transform:scale(.6)}40%{opacity:.6}100%{opacity:0;transform:scale(1.3)}}
@keyframes v-nudge{0%,100%{transform:rotate(45deg) translate(0,0)}50%{transform:rotate(45deg) translate(2px,2px)}}

/* ═══════════════════════ STILLNESS (a11y is a right) ══════════════════════ */
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  *,*::before,*::after{animation:none!important;transition:none!important}
  .reveal{opacity:1!important;transform:none!important}
  .hero .identity{transform:none!important}
  .lookup-plate{transform:none!important}
  .world{translate:none!important}
  body::after{opacity:0!important}
  /* the seal gate holds: hidden until genuinely earned, then fully present */
  .verdict.valid .seal{opacity:0;transform:none}
  .verdict.valid.sealed .seal{opacity:1!important;transform:none!important}
  .verdict.valid.sealed .seal::after{opacity:1}
  .seal__flash{display:none}
}
/* body.still = the JS twin (Save-Data / reduced-motion detected at boot) */
body.still *,body.still *::before,body.still *::after{animation:none!important;transition:none!important}
body.still .reveal{opacity:1!important;transform:none!important}
body.still .world{translate:none!important}
body.still .verdict.valid .seal{opacity:0;transform:none}
body.still .verdict.valid.sealed .seal{opacity:1!important;transform:none!important}
body.still .seal__flash{display:none}

/* ════════════════════════════ COMPACT FOLDS ═══════════════════════════════ */
@media (max-height:880px){
  .hero{padding:clamp(8px,1.6svh,18px) clamp(20px,5vw,48px) clamp(6px,1.2svh,14px)}
  .hero__core{gap:clamp(6px,1.2svh,14px)}
  .hero .type-title{font-size:clamp(20px,4.6svh,34px)}
  .hero .verdict .word{font-size:clamp(19px,3.8svh,30px)}
  .hero .verdict{gap:clamp(6px,1.1svh,12px)}
  .hero .verdict .sub{font-size:clamp(13px,.95rem,15px)}
  .verdict .seal{--d:clamp(52px,11svh,110px)}
  .hero .verdict.revoked .glyph,.hero .verdict.bad .glyph,.hero .verdict.unknown .glyph{
    width:clamp(46px,9.5svh,92px);height:clamp(46px,9.5svh,92px);font-size:clamp(24px,6.8svh,58px)}
  .hero .verdict .hardfact{font-size:clamp(12px,.86rem,13.5px)}
  .hero .verdict .compare{font-size:clamp(12.5px,.92rem,14px)}
  .hero .verdict .honesty{font-size:clamp(12px,.86rem,13.5px);line-height:1.45}
  .hero .recipient{margin-top:.4em;font-size:clamp(14px,1.15rem,19px)}
  .scrollcue{font-size:11.5px;padding:8px 14px}
  .hero--landing .type-title{font-size:clamp(25px,5.6svh,46px)}
  .lookup-plate{padding:clamp(11px,1.9svh,18px) clamp(13px,2.2vw,20px)}
}
@media (max-height:540px){
  .hero{grid-template-rows:auto 1fr auto}
  .hero__core{gap:clamp(3px,.8svh,8px)}
  .hero .eyebrow{font-size:11px;letter-spacing:.24em}
  .hero .type-title{font-size:clamp(16px,3.4svh,24px)}
  .hero .verdict .word{font-size:clamp(15px,3svh,21px);gap:8px}
  .hero .verdict .sub{font-size:clamp(11.5px,.84rem,12.5px);line-height:1.4;max-width:46ch}
  .verdict .seal{--d:clamp(20px,5.5svh,48px)}
  .hero .verdict.revoked .glyph,.hero .verdict.bad .glyph,.hero .verdict.unknown .glyph{
    width:clamp(30px,6.2svh,48px);height:clamp(30px,6.2svh,48px);font-size:clamp(16px,4.2svh,30px)}
  .hero .verdict .hardfact,.hero .verdict .honesty{font-size:clamp(11px,.8rem,12px);line-height:1.35;max-width:56ch}
  .hero .verdict .compare{font-size:clamp(11.5px,.82rem,12.5px);line-height:1.35;max-width:56ch}
  .hero .trustmark .mark{font-size:clamp(14px,3.2svh,17px)}
  .hero .trustmark .svc{font-size:clamp(10px,2.2svh,11px)}
  .scrollcue{font-size:10.5px;padding:6px 12px;min-height:40px}
  .hero--landing .type-title{font-size:clamp(20px,4.6svh,28px)}
  .hero--landing .lead{font-size:clamp(12px,.88rem,13.5px);max-width:58ch}
  .lookup-plate{padding:9px 12px}
  .lookup-plate input{min-height:42px;padding:8px 11px}
  .lookup-plate .lp-go{min-height:42px;padding:8px 18px;font-size:13.5px}
  .lookup-plate .lp-hint{margin-top:6px;font-size:12px;line-height:1.4}
  @media (max-height:380px){
    .verdict .seal,.verdict.valid.sealed .seal{display:none}
  }
}
@media (max-width:560px){
  dl.grid{grid-template-columns:1fr}
  dl.grid dt{padding-bottom:3px}
  dl.grid dd{padding-top:3px}
  .world{padding:18px 16px}
  .actions{flex-direction:column;align-items:stretch}
  .btn{width:100%}
}

/* ═════════════════════════════ PRINT (pure paper) ═════════════════════════ */
@media print{
  html,body{background:#FFF!important;color:#1A1F2E!important}
  .stage,.vignette,.grain,.progress,.hero__beams,.scrollcue,.skip{display:none!important}
  body::after{display:none!important}
  .hero{min-height:auto}
  .hero .type-title,.hero .verdict .word{color:#1A1F2E!important}
  .hero .verdict .sub,.world__copy,.trust,.explainer p,.foot{color:#3A4254!important}
  .status,.world,.panel,.filecheck{background:#FFF!important;border-color:#B9C4D4!important;box-shadow:none!important;backdrop-filter:none!important}
  dl.grid dt,dl.grid dd{background:#FFF!important;color:#1A1F2E!important}
  .btn{display:none!important}
  a{color:#1D4F8F!important}
}`;
}
