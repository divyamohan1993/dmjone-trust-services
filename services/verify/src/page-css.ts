/**
 * The verify portal's standalone "Examination Chamber" stylesheet — a dark
 * cinematic theatre where the brand's gold becomes light. This sheet fully
 * replaces the shared letterhead design system ON THIS SURFACE ONLY (the
 * issuer admin keeps @dmjone/brand untouched); the brand DNA survives in the
 * four serif families (served same-origin from /fonts/:file) and the gold.
 *
 * Non-negotiables encoded here:
 *  - WCAG 2.2 AAA text contrast (≥7:1) on every text/ground pair: ivory
 *    #F2EDDF ≈ 16:1 and gold-text #E3C27D ≈ 11:1 on the #090D17 midnight
 *    stage; state colours (#8FDCAC ok / #F4A8A1 bad / #ECC678 warn / #9FC2F0
 *    scan) all clear 9:1 on their darkest in-use grounds. Functional strokes
 *    hold ≥3:1 (1.4.11).
 *  - 44px minimum interactive targets (2.5.5 AAA).
 *  - prefers-reduced-motion (and body.still, the JS Save-Data twin): every
 *    animation/transition is disabled and every staged element is fully
 *    present in its FINAL state; the earned-seal gate stays intact.
 *  - The seal-scarcity contract, verbatim where load-bearing:
 *      .hero .verdict:not(.valid) .seal{display:none}
 *    plus the bad-state glyph fill, the identity demotion via :has(), and the
 *    upload file-gate exception — same selectors as before, restaged in dark.
 *  - Zero url() images, zero external origins, zero style=""/on*= dependence:
 *    the sheet drops into the nonce CSP and the img-src 'none' policy as-is.
 *
 * String.raw, no backticks/${ in the body (CSS \ escapes survive verbatim).
 */

export function verifyCinemaCss(): string {
  return String.raw`/* ════════════════════════════════════════════════════════════════════════
   dmj.one verify — "The Examination Chamber" (dark cinematic stage)
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

/* ---- Tokens ----------------------------------------------------------------
   TRUST PSYCHOLOGY, deliberately: deep midnight NAVY is the colour humans read
   as security, competence and institutional authority (passports, banknotes,
   uniforms, every serious bank); GOLD is authenticity and the official seal
   (notary wax, intaglio ink, state emblems); IVORY type reads as paper —
   transparency and record. Scrutiny runs COOL (steel-blue examination light:
   clinical, impartial), confirmation lands WARM (gold) or GREEN (the universal
   all-clear) — a tension→relief arc the viewer feels before they read a word.
   Alarm is reserved exclusively for red. Nothing else on the page may shout. */
:root{
  color-scheme:dark;
  --stage:#090D17;          /* midnight archive — the house lights off */
  --stage-2:#0D1322;
  --plate:#10172A;          /* raised navy plates */
  --plate-2:#16203A;
  --line:rgba(212,175,97,.15);
  --line-strong:rgba(212,175,97,.38);
  --steel-line:rgba(159,194,240,.2);
  --cream:#F2EDDF;          /* primary text (paper ivory), ~16:1 on stage */
  --cream-soft:#C7C2B2;     /* secondary text, ~10:1 */
  --gold:#D4AF61;           /* the metal */
  --gold-bright:#F0D78F;    /* the highlight */
  --gold-text:#E3C27D;      /* small gold text, ~11:1 */
  --gold-line:#8C6F2E;      /* functional strokes, ≥3:1 */
  --scan:#9FC2F0;           /* the cool examination light, ~10:1 text-safe */
  --scan-core:#5E84B8;
  --ok:#8FDCAC;             /* state text on dark */
  --ok-core:#36B077;
  --bad:#F4A8A1;
  --bad-core:#E2574E;
  --warn:#ECC678;
  --focus:#F6DD9B;
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
  /* fluid root: ~13.5px on a small phone → 18px wide desktop */
  font-size:clamp(13.5px,calc(10.6px + 0.74vw),18px);
  -webkit-text-size-adjust:100%}
body{margin:0;min-height:100svh;background:
    radial-gradient(120% 70% at 50% -10%,#121A30 0%,transparent 60%),
    radial-gradient(90% 60% at 50% 115%,#0E1526 0%,transparent 65%),
    var(--stage);
  color:var(--cream);font-family:var(--serif);line-height:1.55;
  overflow-x:clip}
::selection{background:rgba(212,175,97,.32);color:#FFF8E8}
a{color:var(--gold-text);text-underline-offset:.18em;text-decoration-thickness:1px}
a:hover{color:var(--gold-bright)}
:focus-visible{outline:2px solid var(--focus);outline-offset:3px;border-radius:4px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.skip{position:fixed;left:12px;top:-48px;z-index:60;background:var(--gold-bright);color:#1A1408;
  font-family:var(--label);font-size:14px;letter-spacing:.08em;padding:10px 16px;border-radius:8px;
  text-decoration:none;transition:top .2s ease}
.skip:focus{top:12px}

/* ---- The stage layers (decoration only; aria-hidden, no pointer) --------- */
.stage{position:fixed;inset:0;z-index:0;width:100%;height:100%;pointer-events:none}
.vignette{position:fixed;inset:0;z-index:1;pointer-events:none;
  background:radial-gradient(125% 95% at 50% 42%,transparent 55%,rgba(3,5,10,.6) 100%)}
.grain{position:fixed;inset:0;z-index:2;pointer-events:none;opacity:.05;mix-blend-mode:overlay}
/* the pointer spotlight — a faint warm reading-lamp that follows the hand */
body::after{content:"";position:fixed;inset:0;z-index:3;pointer-events:none;opacity:0;
  background:radial-gradient(340px 340px at var(--mx) var(--my),rgba(226,213,182,.06),transparent 70%);
  transition:opacity .6s ease}
@media (pointer:fine){body.js:not(.still)::after{opacity:1}}
/* CSS aurora — the no-GPU understudy: one cool + one warm bloom breathing */
body.gpu-none .stage{background:
    radial-gradient(46% 34% at 30% 30%,rgba(94,132,184,.12),transparent 70%),
    radial-gradient(38% 30% at 72% 64%,rgba(203,168,94,.08),transparent 70%)}
body.gpu-none.js:not(.still) .stage{animation:aurora 26s ease-in-out infinite alternate}
@keyframes aurora{from{background-position:0% 0%,100% 100%;filter:hue-rotate(0deg)}
  to{background-position:14% 8%,86% 88%;filter:hue-rotate(-8deg)}}

/* the scroll progress hairline — pure scroll-timeline, hidden if unsupported */
.progress{display:none}
@supports (animation-timeline:scroll()){
  .progress{display:block;position:fixed;top:0;left:0;right:0;height:2px;z-index:50;
    transform-origin:0 50%;transform:scaleX(0);
    background:linear-gradient(90deg,var(--gold-line),var(--gold-bright));
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
/* a whisper of architecture: one hairline + four gold corner ticks */
.hero__frame{position:absolute;inset:clamp(10px,2vh,22px);border:1px solid rgba(212,175,97,.16);
  border-radius:4px;pointer-events:none;z-index:-1}
.hero__frame::before,.hero__frame::after{content:"";position:absolute;width:7px;height:7px;
  background:var(--gold);transform:rotate(45deg);opacity:.7}
.hero__frame::before{top:-4px;left:-4px;box-shadow:calc(100% + 8px) 0 0 var(--gold)}
.hero__frame::after{bottom:-4px;left:-4px;box-shadow:calc(100% + 8px) 0 0 var(--gold)}
/* two volumetric light shafts: the COOL examination light crossing the WARM
   authenticity light — impartial scrutiny meeting the genuine article */
.hero__beams{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:-1;opacity:.85}
.hero__beams::before,.hero__beams::after{content:"";position:absolute;top:-30%;height:160%;width:34%;
  filter:blur(2px)}
.hero__beams::before{left:6%;transform:rotate(8deg);
  background:linear-gradient(105deg,transparent 30%,rgba(94,132,184,.06) 47%,rgba(159,194,240,.1) 50%,rgba(94,132,184,.06) 53%,transparent 70%)}
.hero__beams::after{right:4%;transform:rotate(-10deg);opacity:.8;
  background:linear-gradient(105deg,transparent 30%,rgba(212,175,97,.05) 47%,rgba(240,215,143,.09) 50%,rgba(212,175,97,.05) 53%,transparent 70%)}
body.js:not(.still) .hero__beams::before{animation:beam-drift 17s ease-in-out infinite alternate}
body.js:not(.still) .hero__beams::after{animation:beam-drift 23s ease-in-out infinite alternate-reverse}
@keyframes beam-drift{from{transform:rotate(8deg) translateX(-2.5%)}to{transform:rotate(6.5deg) translateX(2.5%)}}

/* (1) trustmark — the institution at the crown */
.hero .trustmark{display:flex;align-items:baseline;justify-content:center;gap:.62ch;flex-wrap:wrap;
  border:0;padding:0;view-transition-name:masthead;animation:v-fade-down .7s .1s both ease-out}
.hero .trustmark .mark{font-family:var(--display);font-weight:700;font-size:clamp(19px,2.4vw,23px);
  letter-spacing:.01em;color:var(--cream)}
.hero .trustmark .mark b{color:var(--gold-bright);font-weight:700}
.hero .trustmark .svc{font-family:var(--label);font-size:clamp(11px,1.5vw,12.5px);letter-spacing:.24em;
  text-transform:uppercase;color:var(--gold-text)}

/* the centre stack, set on a soft scrim so type never fights the particles —
   readability is the first courtesy of a trustworthy page */
.hero__core{position:relative;align-self:center;display:flex;flex-direction:column;align-items:center;
  gap:clamp(12px,2.2svh,26px);padding:clamp(4px,1.2svh,14px) 0;perspective:1200px}
.hero__core::before{content:"";position:absolute;inset:-6% -18%;z-index:-1;pointer-events:none;
  background:radial-gradient(56% 56% at 50% 46%,rgba(9,13,23,.85),rgba(9,13,23,.5) 58%,transparent 78%)}

/* (2) the document identity — an engraved plaque floating in the dark */
.hero .identity{transform:rotateX(var(--tx,0deg)) rotateY(var(--ty,0deg));
  transform-style:preserve-3d;will-change:transform;transition:transform .18s ease-out;
  position:relative;padding:clamp(4px,1svh,10px) clamp(10px,2vw,26px)}
/* glare that follows the pointer across the plaque */
.hero .identity::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:12px;
  background:radial-gradient(420px 200px at var(--gx,50%) var(--gy,40%),rgba(240,215,143,.07),transparent 70%);
  opacity:0;transition:opacity .4s ease}
@media (pointer:fine){body.js:not(.still) .hero .identity:hover::after{opacity:1}}
.hero .eyebrow{font-family:var(--label);font-size:clamp(11.5px,.84rem,14px);letter-spacing:.36em;
  text-transform:uppercase;color:var(--gold-text);margin:0;animation:v-fade-in .5s .12s both ease-out}
.hero .type-title{font-family:var(--display);font-weight:700;text-transform:uppercase;
  font-size:clamp(20px,2.35rem,46px);letter-spacing:.05em;margin:.14em 0 0;line-height:1.08;color:var(--cream);
  max-width:100%;overflow-wrap:break-word;display:-webkit-box;-webkit-box-orient:vertical;
  -webkit-line-clamp:2;line-clamp:2;overflow:hidden;
  text-shadow:0 1px 2px rgba(4,7,14,.9),0 4px 22px rgba(4,7,14,.7);
  animation:v-fade-up .6s .18s both ease-out}
/* every hero line carries a deep, soft drop so it reads over any particle —
   contrast is computed against the scrim, the shadow makes it effortless */
.hero .eyebrow,.hero .recipient,.hero .docmeta,.hero .verdict .word,.hero .verdict .sub,
.hero .verdict .hardfact,.hero .verdict .compare,.hero .verdict .honesty,
.hero--landing .lead{text-shadow:0 1px 2px rgba(4,7,14,.85),0 2px 16px rgba(4,7,14,.65)}
.hero .type-title.doc-name{text-transform:none;font-size:clamp(18px,1.75rem,32px);letter-spacing:.012em;line-height:1.16;
  max-width:min(94vw,34ch);overflow-wrap:anywhere;-webkit-line-clamp:3;line-clamp:3}
.hero .recipient{margin:.75em 0 0;font-family:var(--label);font-size:clamp(15px,1.32rem,22px);
  letter-spacing:.05em;color:var(--gold-bright);animation:v-fade-up .6s .26s both ease-out}
.hero .recipient .lbl{display:block;font-family:var(--serif);font-style:italic;font-weight:400;
  font-size:clamp(13px,1rem,16px);letter-spacing:.01em;color:var(--cream-soft);margin-bottom:.22em}
.hero .docmeta{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;
  margin:1em 0 0;font-family:var(--label);font-size:13.5px;color:var(--cream-soft);
  animation:v-fade-up .6s .26s both ease-out}
.hero .docmeta .filechip{font-size:11.5px;letter-spacing:.14em;color:var(--gold-text);
  border:1px solid var(--gold-line);border-radius:5px;padding:3px 8px;background:rgba(212,175,97,.08)}
.hero .docmeta .docnum .k{color:var(--cream-soft);margin-right:.5ch}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em;
  color:var(--gold-text);letter-spacing:.04em;overflow-wrap:anywhere}

/* (3) THE VERDICT — the cinematic moment ----------------------------------- */
.hero .verdict{position:relative;display:flex;flex-direction:column;align-items:center;
  gap:clamp(10px,1.6svh,18px);margin:0;max-width:min(92vw,64ch)}
/* the examination ring: a COOL conic scan that encircles the verdict ONLY
   while the live re-check runs (body.is-checking) — clinical, impartial light;
   the warmth is earned afterwards. Decorative; the status badge speaks. */
.hero .verdict::before{content:"";position:absolute;inset:-22px -30px;border-radius:26px;
  pointer-events:none;opacity:0;
  background:conic-gradient(from 0deg,transparent 0 78%,rgba(159,194,240,.55) 92%,transparent 100%);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  mask-composite:exclude;padding:1.5px;transition:opacity .45s ease}
body.is-checking:not(.still) .hero .verdict::before{opacity:1;animation:rite-spin 1.6s linear infinite}
@keyframes rite-spin{to{transform:rotate(1turn)}}
/* the guilloche rosette — security-print engraving (banknote/notary language)
   faintly behind the verdict slot; pure ornament, never a contrast hazard */
.rosette{position:absolute;left:50%;top:0;transform:translate(-50%,-32%);z-index:-1;
  width:clamp(150px,min(52vw,38svh),360px);height:auto;opacity:.13;pointer-events:none;color:var(--gold)}
.verdict.revoked .rosette,.verdict.bad .rosette,.verdict.unknown .rosette,.rosette--cool{color:var(--scan-core)}
body.js:not(.still) .rosette{animation:rosette-turn 240s linear infinite}
@keyframes rosette-turn{to{transform:translate(-50%,-32%) rotate(1turn)}}
.hero .verdict .word{display:flex;flex-direction:column;align-items:center;gap:clamp(10px,1.8svh,20px);
  margin:0;font-family:var(--display);font-weight:700;font-size:clamp(24px,2.3rem,46px);
  letter-spacing:.02em;line-height:1.06;color:var(--cream)}
.hero .verdict.valid .word,.hero .verdict .word{animation:v-fade-up .52s .1s both ease-out}
.hero .verdict .sub{max-width:40ch;margin:0;font-size:clamp(14px,1.04rem,17px);line-height:1.55;
  color:var(--cream-soft);animation:v-fade-up .52s .2s both ease-out}
/* verdict word colours by state (the WORD + GLYPH carry it; colour reinforces) */
.hero .verdict.valid #verdict-word{color:var(--gold-bright);
  text-shadow:0 0 26px rgba(240,215,143,.3)}
.hero .verdict.revoked #verdict-word,.hero .verdict.bad #verdict-word{color:var(--bad)}
.hero .verdict.unknown #verdict-word,.hero .verdict.unconfirmed #verdict-word{color:var(--cream)}

/* letter-split reveal (JS wraps letters; aria-label preserved on .word) */
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
  background:radial-gradient(circle at 50% 38%,rgba(226,87,78,.16),transparent 72%);
  box-shadow:0 0 44px -8px rgba(226,87,78,.35),inset 0 0 24px rgba(226,87,78,.12)}
.hero .verdict.unknown .glyph{color:var(--cream-soft);
  background:radial-gradient(circle at 50% 38%,rgba(201,191,173,.1),transparent 72%)}
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
  text-decoration-color:rgba(226,87,78,.55);text-decoration-thickness:2px}
.hero__core:has(.verdict.unknown) .type-title{text-decoration:none}
/* upload file-gate exception: the record is genuine — never deface the doc name
   when the HOLDER's file mismatches; the glyph + file row carry the alarm. */
body[data-filegate="1"] .hero__core:has(.verdict.bad) .identity{opacity:1;filter:none}
body[data-filegate="1"] .hero__core:has(.verdict.bad) .type-title{text-decoration:none}

/* supporting hero lines */
.hero .verdict .hardfact{margin:0;max-width:46ch;font-family:var(--label);
  font-size:clamp(12.5px,.9rem,14.5px);letter-spacing:.05em;color:var(--gold-text);
  line-height:1.55;animation:v-fade-up .52s .3s both ease-out}
.hero .verdict .compare{margin:0;max-width:44ch;font-family:var(--serif);font-style:italic;
  font-size:clamp(13px,.97rem,15.5px);color:var(--cream);line-height:1.55;
  animation:v-fade-up .52s .38s both ease-out}
.hero .verdict .honesty{margin:0;max-width:52ch;font-family:var(--serif);
  font-size:clamp(12.5px,.9rem,14.5px);line-height:1.55;color:var(--cream-soft);
  animation:v-fade-in .52s .46s both ease-out}

/* ---- THE SEAL — a struck gold medallion, lit for the dark stage ---------- */
.verdict .seal{--d:clamp(70px,min(26vw,19svh),200px);--sx:36%;--sy:30%;position:relative;
  width:var(--d);height:var(--d);min-height:var(--d);flex:0 0 auto;overflow:visible;
  border-radius:50%;display:grid;place-items:center;
  background:
    radial-gradient(58% 58% at var(--sx) var(--sy),#FBEFC8 0%,transparent 56%),
    radial-gradient(120% 120% at 70% 82%,#5A430D 0%,transparent 60%),
    conic-gradient(from 210deg,#C9A24B,#7E611A 22%,#EBD088 40%,#8F6F1F 58%,#D8B45E 74%,#75590F 88%,#C9A24B);
  box-shadow:
    inset 0 2px 3px rgba(255,243,205,.9),
    inset 0 -3px 7px rgba(46,33,6,.75),
    inset 0 0 0 1px rgba(110,82,15,.35),
    0 0 0 1px rgba(240,215,143,.14),
    0 26px 60px -22px rgba(0,0,0,.85),
    0 0 70px -10px rgba(212,175,97,.4);
  opacity:0;transform:scale(.6);transition:opacity .36s ease,transform .36s ease}
.verdict .seal::before{content:"";position:absolute;inset:9%;border-radius:50%;
  box-shadow:inset 0 1px 2px rgba(46,33,6,.7),inset 0 -1px 1px rgba(255,243,205,.55),0 0 0 1px rgba(255,243,205,.2)}
/* halo behind the struck seal — the stage light catching the metal */
.verdict .seal::after{content:"";position:absolute;inset:-26%;border-radius:50%;z-index:-1;opacity:0;
  background:radial-gradient(closest-side,rgba(240,215,143,.28),rgba(212,175,97,.07) 58%,transparent 75%)}
.seal__ring{position:absolute;inset:0;width:100%;height:100%}
.seal__ring text{font-family:var(--label);font-size:6.4px;letter-spacing:1.15px;text-transform:uppercase;fill:#52400E}
.seal__core{position:relative;display:grid;place-items:center;gap:2px;z-index:2}
.seal__script{font-family:var(--script);font-size:calc(var(--d) * .26);line-height:.9;color:#4E3C0B;
  text-shadow:0 1px 0 rgba(255,243,205,.6),0 -1px 1px rgba(46,33,6,.55);margin-top:-.06em}
.seal__star{font-size:calc(var(--d) * .10);color:#5F490F;line-height:1;margin-bottom:-.04em;
  text-shadow:0 1px 0 rgba(255,243,205,.55)}
.seal__flash{position:absolute;inset:-8%;border-radius:50%;border:2px solid var(--gold-bright);
  opacity:0;z-index:-1;pointer-events:none}
/* EARNED: a live VALID strikes the seal; the halo blooms; one flash ring */
.verdict.valid.sealed .seal{height:var(--d);opacity:1;overflow:visible;
  animation:v-stamp .78s cubic-bezier(.2,.85,.25,1.55) both}
.verdict.valid.sealed .seal::after{opacity:1;transition:opacity .9s .25s ease}
.verdict.valid.sealed .seal__flash{animation:v-flash .75s .06s ease-out both}
body.js:not(.still) .verdict.valid.sealed .seal{animation:v-stamp .78s cubic-bezier(.2,.85,.25,1.55) both,
  seal-breathe 7s 2.2s ease-in-out infinite}
@keyframes seal-breathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3px) scale(1.012)}}

/* (4) scroll cue */
.scrollcue{display:inline-flex;flex-direction:column;align-items:center;gap:6px;justify-self:center;
  font-family:var(--label);font-size:12.5px;letter-spacing:.28em;text-transform:uppercase;
  padding:10px 18px;margin:-6px 0 0;min-height:44px;color:var(--gold-text);text-decoration:none;
  animation:v-fade-in .7s .8s both ease-out}
.scrollcue .chev{width:14px;height:14px;border-right:1.5px solid var(--gold-text);
  border-bottom:1.5px solid var(--gold-text);transform:rotate(45deg)}
body.js:not(.still) .scrollcue .chev{animation:v-nudge 1.9s 1.6s ease-in-out infinite}
.scrollcue:hover{color:var(--gold-bright)}
.scrollcue:hover .chev{border-color:var(--gold-bright)}

/* ═══════════════════ BELOW THE FOLD — THE DESCENT ═════════════════════════ */
/* the proof column floats on a translucent dark sheet: the stage stays alive
   at the edges while every paragraph sits on quiet, readable ground */
.proof{position:relative;max-width:820px;margin:0 auto;
  padding:clamp(44px,9vh,110px) clamp(20px,5vw,32px) 28px}
.proof::before{content:"";position:absolute;inset:0 -8%;z-index:-1;pointer-events:none;
  background:linear-gradient(180deg,transparent,rgba(9,13,23,.66) 70px,rgba(9,13,23,.66) calc(100% - 40px),rgba(9,13,23,.4));
  -webkit-mask:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);
  mask:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
.proof__intro{text-align:center;margin-bottom:clamp(34px,6vh,64px)}
.proof__intro .ek{font-family:var(--label);font-size:12.5px;letter-spacing:.3em;text-transform:uppercase;
  color:var(--gold-text);margin:0}
.proof__intro h2{font-family:var(--display);font-weight:600;font-size:clamp(23px,3.4vw,32px);
  letter-spacing:.02em;color:var(--cream);margin:10px 0 0}
.block-h{font-family:var(--label);font-size:13px;letter-spacing:.2em;text-transform:uppercase;
  color:var(--gold-text);margin:0 0 16px}

/* ---- the status badge (glass plate) -------------------------------------- */
.status{display:flex;align-items:flex-start;gap:14px;padding:16px 18px;border-radius:14px;
  border:1px solid var(--line-strong);background:linear-gradient(180deg,rgba(22,30,52,.72),rgba(13,19,34,.72));
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  box-shadow:inset 0 1px 0 rgba(240,215,143,.08),0 18px 40px -28px rgba(0,0,0,.9)}
.status .dot{flex:0 0 auto;width:12px;height:12px;border-radius:50%;margin-top:5px;
  background:var(--cream-soft);box-shadow:0 0 12px rgba(201,191,173,.4)}
.status .txt{display:grid;gap:3px}
.status .txt b{font-family:var(--label);font-weight:400;font-size:14px;letter-spacing:.16em;color:var(--cream)}
.status .txt span{font-size:14.5px;line-height:1.55;color:var(--cream-soft)}
.status.valid{border-color:rgba(54,176,119,.4)}
.status.valid .dot{background:var(--ok-core);box-shadow:0 0 14px rgba(54,176,119,.55)}
.status.valid .txt b{color:var(--ok)}
.status.bad,.status.revoked{border-color:rgba(226,87,78,.42)}
.status.bad .dot,.status.revoked .dot{background:var(--bad-core);box-shadow:0 0 14px rgba(226,87,78,.5)}
.status.bad .txt b,.status.revoked .txt b{color:var(--bad)}
.status.unknown .dot{background:var(--cream-soft)}
.status.unconfirmed{border-color:rgba(236,198,120,.4)}
.status.unconfirmed .dot{background:var(--warn);box-shadow:0 0 12px rgba(236,198,120,.5)}
.status.unconfirmed .txt b{color:var(--warn)}
.status.checking{border-color:var(--steel-line)}
.status.checking .dot{background:var(--scan);box-shadow:0 0 14px rgba(159,194,240,.6)}
.status.checking .txt b{color:var(--scan)}
body.js:not(.still) .status.checking .dot{animation:dot-pulse 1.05s ease-in-out infinite}
@keyframes dot-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.7);opacity:.55}}

/* ---- the check constellation ---------------------------------------------- */
.checks{list-style:none;margin:18px 0 0;padding:0;display:grid;position:relative}
.checks li{position:relative;display:grid;grid-template-columns:30px 1fr;gap:0 16px;align-items:start;
  padding:13px 4px 13px 8px;font-size:15.5px;line-height:1.5;color:var(--cream)}
/* the connecting thread */
.checks li::before{content:"";position:absolute;left:22px;top:0;bottom:0;width:1px;
  background:linear-gradient(180deg,transparent,var(--line) 18%,var(--line) 82%,transparent)}
.checks li:first-child::before{top:50%}
.checks li:last-child::before{bottom:50%}
/* the node */
.checks .ic{position:relative;z-index:1;width:29px;height:29px;margin-top:-2px;border-radius:50%;
  border:1.5px solid var(--gold-line);background:var(--plate);
  display:grid;place-items:center;font-size:13px;line-height:1;font-family:var(--label);color:transparent}
.checks .ic::after{content:"";width:7px;height:7px;border-radius:50%;background:var(--line-strong);
  transition:transform .3s ease,background .3s ease,box-shadow .3s ease}
.checks li.run .ic{border-color:var(--steel-line)}
.checks li.run .ic::after{background:var(--scan)}
body.js:not(.still) .checks li.run .ic::after{animation:dot-pulse 1s ease-in-out infinite}
.checks li.pass .ic{border-color:rgba(54,176,119,.6);color:var(--ok)}
.checks li.pass .ic::after{content:"✓";width:auto;height:auto;border-radius:0;background:none;
  font-size:14px;color:var(--ok);text-shadow:0 0 10px rgba(54,176,119,.5)}
.checks li.fail .ic{border-color:rgba(226,87,78,.65);color:var(--bad)}
.checks li.fail .ic::after{content:"✕";width:auto;height:auto;border-radius:0;background:none;
  font-size:13px;color:var(--bad)}
.checks li.warn .ic{border-color:rgba(236,198,120,.6)}
.checks li.warn .ic::after{content:"◌";width:auto;height:auto;border-radius:0;background:none;
  font-size:14px;color:var(--warn)}
/* ignition flash when a node lights */
body.js:not(.still) .checks li.lit .ic{animation:node-ignite .55s ease-out both}
@keyframes node-ignite{0%{box-shadow:0 0 0 0 rgba(240,215,143,.55)}100%{box-shadow:0 0 0 16px rgba(240,215,143,0)}}
.checks li.pass{color:var(--cream)}
.checks li.fail{color:var(--bad)}
.checks li.warn{color:var(--warn)}
.checks li.fail span:not(.ic),.checks li.warn span:not(.ic){font-weight:600}

/* ---- the upload file-gate (the scanner) ----------------------------------- */
.filecheck{margin-top:22px;padding:20px;border-radius:16px;border:1px solid var(--line-strong);
  background:linear-gradient(180deg,rgba(22,30,52,.6),rgba(13,19,34,.7))}
.filecheck .fc-lead{font-family:var(--display);font-weight:600;font-size:clamp(17px,1.2rem,20px);
  color:var(--cream);margin:0 0 6px}
.filecheck .fc-why{font-size:14.5px;line-height:1.55;color:var(--cream-soft);margin:0 0 14px}
.fc-drop{position:relative;display:grid;gap:12px;justify-items:center;padding:26px 18px;border-radius:12px;
  border:1.5px dashed var(--gold-line);background:rgba(212,175,97,.04);overflow:hidden;
  transition:border-color .25s ease,background .25s ease}
.fc-drop.over{border-color:var(--gold-bright);background:rgba(212,175,97,.1)}
/* the scan beam sweeps the dropzone while the file is being verified — COOL
   examination light (the lab), never gold (gold is earned, not spent) */
.fc-drop::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;
  background:linear-gradient(180deg,transparent 0%,rgba(159,194,240,.13) 48%,rgba(191,216,245,.3) 50%,rgba(159,194,240,.13) 52%,transparent 100%);
  background-size:100% 220%;background-position:0 -60%}
body.js:not(.still) .fc-drop.scanning::after{opacity:1;animation:scanbeam 1.3s linear infinite}
@keyframes scanbeam{from{background-position:0 -60%}to{background-position:0 160%}}
.fc-cta{font-family:var(--label);font-size:15px;letter-spacing:.04em;color:var(--cream);cursor:pointer;
  min-height:44px;display:grid;place-items:center}
.fc-input{font-size:14px;color:var(--cream-soft);max-width:100%}
.fc-input::file-selector-button{font-family:var(--label);font-size:13.5px;letter-spacing:.04em;
  color:var(--gold-text);background:transparent;border:1px solid var(--gold-line);border-radius:8px;
  padding:9px 14px;margin-right:12px;cursor:pointer;min-height:40px}
.filecheck .fc-note{font-size:13.5px;line-height:1.55;color:var(--cream-soft);margin:12px 0 0}
.filecheck .fc-msg{font-size:14.5px;line-height:1.5;margin:10px 0 0;min-height:1.4em;color:var(--cream)}
.filecheck .fc-msg.ok{color:var(--ok)}
.filecheck .fc-msg.err{color:var(--bad)}

/* ---- the three worlds (scroll chapters) ----------------------------------- */
.worlds{list-style:none;margin:clamp(40px,7vh,72px) 0 0;padding:0;display:grid;gap:clamp(30px,6vh,56px);
  counter-reset:world}
.world{position:relative;display:grid;gap:18px;padding:clamp(22px,3.5vw,34px);border-radius:18px;
  border:1px solid var(--line);background:linear-gradient(165deg,rgba(18,25,44,.55),rgba(10,14,25,.65));
  box-shadow:inset 0 1px 0 rgba(240,215,143,.06),0 24px 60px -40px rgba(0,0,0,.9);overflow:hidden}
.world::before{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(90% 70% at 18% 0%,rgba(212,175,97,.07),transparent 60%)}
.world__head{display:flex;align-items:baseline;gap:14px}
.world__num{font-family:var(--label);font-size:12.5px;letter-spacing:.22em;color:var(--gold-text);
  border:1px solid var(--gold-line);border-radius:999px;padding:7px 13px;background:rgba(212,175,97,.06)}
.world__title{font-family:var(--display);font-weight:600;font-size:clamp(19px,1.5rem,26px);
  letter-spacing:.02em;color:var(--cream);margin:0}
.world__copy{font-size:clamp(14.5px,1.02rem,16.5px);line-height:1.6;color:var(--cream-soft);margin:0;max-width:62ch}
.world__copy strong{color:var(--cream)}
.world__fact{display:flex;align-items:center;gap:10px;font-family:var(--label);font-size:13.5px;
  letter-spacing:.06em;margin:0}
.world__fact .st{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
.world__fact.pass{color:var(--ok)} .world__fact.pass .st{background:var(--ok-core);box-shadow:0 0 10px rgba(54,176,119,.5)}
.world__fact.warn{color:var(--warn)} .world__fact.warn .st{background:var(--warn);box-shadow:0 0 10px rgba(236,198,120,.5)}
.world__fact.fail{color:var(--bad)} .world__fact.fail .st{background:var(--bad-core)}
.world__fact.idle{color:var(--cream-soft)} .world__fact.idle .st{background:var(--cream-soft)}

/* the set pieces (inline SVG, crisp + printable) */
.world__art{width:100%;max-width:560px;justify-self:center;margin-top:4px}
.world__art svg{width:100%;height:auto;display:block}
.art-line{stroke:var(--gold-line);stroke-width:1;fill:none}
.art-line--soft{stroke:rgba(212,175,97,.22)}
.art-node{fill:#1B2440;stroke:var(--gold-line);stroke-width:1}
.art-node--lit{fill:#2B3760;stroke:var(--gold-bright);stroke-width:1.4}
.art-glow{fill:rgba(240,215,143,.85)}
.art-text{font-family:var(--label);font-size:7.5px;letter-spacing:.12em;fill:var(--gold-text);text-transform:uppercase}
.art-text--dim{fill:var(--cream-soft)}
.art-text--big{font-size:10px;fill:var(--cream)}
.art-chain-link{stroke:var(--gold-bright);stroke-width:1.6;fill:none;stroke-dasharray:4 3}
.art-anchor--ok .art-anchor-dot{fill:var(--ok-core)}
.art-anchor--pending .art-anchor-dot{fill:var(--warn)}
body.js:not(.still) .art-anchor--pending .art-anchor-dot{animation:dot-pulse 1.6s ease-in-out infinite}
.art-hand{stroke:var(--gold-bright);stroke-width:1.8;stroke-linecap:round}
.art-hand--minute{stroke-width:1.2}
.art-tick{stroke:var(--gold-line);stroke-width:1}
.art-dial{fill:none;stroke:var(--line-strong);stroke-width:1.2}

/* lattice draw-on (scroll-driven where supported) */
.art-draw{stroke-dasharray:520;stroke-dashoffset:0}
@supports (animation-timeline:view()){
  body.js:not(.still) .art-draw{animation:art-draw-in 1ms linear both;animation-timeline:view(block 88% 30%)}
  @keyframes art-draw-in{from{stroke-dashoffset:520}to{stroke-dashoffset:0}}
}

/* scroll reveals: scroll-timeline native; .in class is the IO fallback */
.reveal{opacity:1;transform:none}
@supports (animation-timeline:view()){
  body.js:not(.still) .reveal{animation:reveal-up 1ms linear both;animation-timeline:view(block 94% 22%)}
  @keyframes reveal-up{from{opacity:0;transform:translateY(34px)}to{opacity:1;transform:none}}
}
@supports not (animation-timeline:view()){
  body.js:not(.still) .reveal{opacity:0;transform:translateY(26px);
    transition:opacity .7s ease,transform .7s cubic-bezier(.2,.7,.2,1)}
  body.js:not(.still) .reveal.in{opacity:1;transform:none}
}

/* ---- facts, trust, actions ------------------------------------------------ */
.facts{margin-top:clamp(38px,6.5vh,60px)}
dl.grid{display:grid;grid-template-columns:minmax(120px,auto) 1fr;gap:1px;margin:0;
  border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--line)}
dl.grid dt{font-family:var(--label);font-size:13.5px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--gold-text);padding:13px 16px;background:rgba(13,19,34,.85)}
dl.grid dd{margin:0;font-size:15px;line-height:1.5;color:var(--cream);padding:13px 16px;
  background:rgba(18,25,44,.6);overflow-wrap:anywhere}
.pill{display:inline-block;font-family:var(--label);font-size:12.5px;letter-spacing:.14em;
  padding:5px 12px;border-radius:999px;border:1px solid}
.pill.valid{color:var(--ok);border-color:rgba(54,176,119,.55);background:rgba(54,176,119,.1)}
.pill.revoked,.pill.bad{color:var(--bad);border-color:rgba(226,87,78,.55);background:rgba(226,87,78,.1)}
.pill.unknown{color:var(--cream-soft);border-color:var(--line-strong);background:rgba(201,191,173,.07)}

.trust{margin-top:clamp(32px,5vh,48px);font-size:14.5px;line-height:1.62;color:var(--cream-soft);
  border-left:2px solid var(--gold-line);padding-left:16px}
.trust strong{color:var(--cream)}
/* the conditional timestamp line: selected via its aria-label so the class
   token "trust-ts" appears in the document ONLY when the line itself does
   (the absence of that token is a test-pinned honesty signal) */
.trust[aria-label="Trusted timestamp"]{border-left-color:rgba(54,176,119,.5)}

.actions{margin-top:clamp(30px,5vh,44px);display:flex;flex-wrap:wrap;gap:12px}
.btn{--magx:0px;--magy:0px;position:relative;display:inline-flex;align-items:center;justify-content:center;
  min-height:46px;padding:12px 22px;border-radius:11px;border:1px solid var(--gold-line);
  font-family:var(--label);font-size:14.5px;letter-spacing:.06em;text-decoration:none;cursor:pointer;
  color:var(--gold-text);background:rgba(212,175,97,.06);
  transform:translate(var(--magx),var(--magy));
  transition:transform .25s cubic-bezier(.2,.7,.2,1.4),background .25s ease,color .25s ease,border-color .25s ease;
  overflow:hidden}
.btn:hover{color:var(--gold-bright);border-color:var(--gold-bright);background:rgba(212,175,97,.12)}
.btn.primary{color:#1A1408;border-color:transparent;font-weight:600;
  background:linear-gradient(160deg,#F0D78F,#D4AF61 58%,#B98F3C);
  box-shadow:inset 0 1px 0 rgba(255,248,224,.75),0 14px 30px -16px rgba(212,175,97,.55)}
.btn.primary:hover{background:linear-gradient(160deg,#F6E2A6,#DDB96C 58%,#C39945)}
/* sheen sweep on hover (fine pointers, motion allowed) */
.btn::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;
  background:linear-gradient(115deg,transparent 32%,rgba(255,250,232,.34) 50%,transparent 68%);
  transform:translateX(-70%)}
@media (pointer:fine){
  body.js:not(.still) .btn:hover::after{opacity:1;animation:sheen .9s ease both}
}
@keyframes sheen{from{transform:translateX(-70%)}to{transform:translateX(70%)}}
.action-glosses{margin:14px 0 0;display:grid;grid-template-columns:auto 1fr;gap:5px 12px;
  font-size:13.5px;line-height:1.55;color:var(--cream-soft)}
.action-glosses dt{font-family:var(--label);letter-spacing:.05em;color:var(--gold-text)}
.action-glosses dd{margin:0}

/* ---- the recipient panel (password ritual) -------------------------------- */
.panel{margin-top:20px;border:1px solid var(--line-strong);border-radius:16px;overflow:hidden;
  background:linear-gradient(180deg,rgba(22,30,52,.55),rgba(12,17,30,.7))}
.panel summary{list-style:none;cursor:pointer;padding:17px 20px;font-family:var(--label);
  font-size:15px;letter-spacing:.05em;color:var(--cream);display:flex;align-items:center;gap:12px;min-height:44px}
.panel summary::-webkit-details-marker{display:none}
.panel summary::before{content:"";width:9px;height:9px;border-right:1.5px solid var(--gold-text);
  border-bottom:1.5px solid var(--gold-text);transform:rotate(-45deg);transition:transform .3s ease;flex:0 0 auto}
.panel[open] summary::before{transform:rotate(45deg)}
.panel .inner{padding:6px 20px 22px}
.panel label{display:block;font-family:var(--label);font-size:13.5px;letter-spacing:.08em;
  color:var(--gold-text);margin:8px 0 8px}
.panel input[type="password"]{width:100%;min-height:46px;padding:12px 14px;border-radius:10px;
  border:1px solid var(--gold-line);background:rgba(7,10,18,.7);color:var(--cream);
  font-size:16px;letter-spacing:.06em}
.panel input[type="password"]:focus{border-color:var(--gold-bright);outline:none;
  box-shadow:0 0 0 3px rgba(240,215,143,.18)}
.panel .actions{margin-top:14px}
.msg{font-size:14px;line-height:1.55;color:var(--cream-soft);margin:10px 0 0;min-height:1.3em}
.msg.ok{color:var(--ok)}
.msg.err{color:var(--bad)}

/* ---- explainer + the bit flip --------------------------------------------- */
.explainer{margin-top:clamp(38px,6.5vh,60px)}
.explainer p{font-size:14.5px;line-height:1.62;color:var(--cream-soft);margin:0 0 12px;max-width:68ch}
.explainer strong{color:var(--cream)}
.flip{display:flex;align-items:center;gap:7px;font-family:ui-monospace,Menlo,Consolas,monospace;
  font-size:14px;color:var(--cream-soft)}
.flip .bit{display:grid;place-items:center;width:30px;height:34px;border-radius:7px;
  border:1px solid var(--line-strong);background:rgba(13,19,34,.8);color:var(--gold-text)}
.flip .bit.changed{border-color:rgba(226,87,78,.7);color:var(--bad);background:rgba(226,87,78,.1)}
body.js:not(.still) .flip .bit.changed{animation:bit-blink 2.6s ease-in-out infinite}
@keyframes bit-blink{0%,72%,100%{opacity:1}82%{opacity:.35}}

/* ---- footer ---------------------------------------------------------------- */
.foot{position:relative;z-index:4;max-width:820px;margin:0 auto;
  padding:26px clamp(20px,5vw,32px) 40px;text-align:center;
  font-size:13.5px;line-height:1.7;color:var(--cream-soft);border-top:1px solid var(--line)}
.foot .motto{font-style:italic;color:var(--gold-text)}

/* ════════════════════════ THE LANDING VARIANT ═════════════════════════════ */
.hero--landing .hero__core{max-width:680px;margin-inline:auto;gap:clamp(12px,2svh,24px)}
.hero--landing .type-title{font-size:clamp(30px,3rem,58px);letter-spacing:.015em;text-transform:none;
  -webkit-line-clamp:3;line-clamp:3}
.hero--landing .lead{font-family:var(--serif);font-style:italic;font-size:clamp(15px,1.14rem,19px);
  line-height:1.55;color:var(--cream-soft);max-width:46ch;margin:0;animation:v-fade-up .56s .22s both ease-out}
.hero--landing .honesty{max-width:52ch;font-family:var(--serif);font-size:clamp(12.5px,.9rem,14.5px);
  line-height:1.55;color:var(--cream-soft);margin:0;animation:v-fade-in .52s .5s both ease-out}

/* the lookup instrument: dark glass over the living stage */
.lookup-plate{--tx:0deg;--ty:0deg;width:min(100%,580px);margin-top:clamp(6px,1.4svh,16px);text-align:left;
  border:1px solid var(--line-strong);border-radius:16px;
  background:linear-gradient(180deg,rgba(22,30,52,.6),rgba(12,17,30,.74));
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  box-shadow:inset 0 1px 0 rgba(240,215,143,.1),0 30px 70px -36px rgba(0,0,0,.95),0 0 50px -18px rgba(212,175,97,.25);
  padding:clamp(16px,2.4svh,24px) clamp(16px,2.6vw,24px);
  transform:perspective(1100px) rotateX(var(--tx)) rotateY(var(--ty));
  transition:transform .18s ease-out;animation:v-fade-up .56s .32s both ease-out}
.lookup-plate .lp-label{display:block;font-family:var(--label);font-size:12px;
  letter-spacing:.24em;text-transform:uppercase;color:var(--gold-text);margin:0 0 9px}
.lookup-plate .lp-row{display:flex;gap:10px;flex-wrap:wrap}
.lookup-plate input{flex:1 1 200px;min-width:0;min-height:46px;font-family:var(--label);letter-spacing:.07em;
  text-transform:uppercase;font-size:clamp(16px,1.05rem,17.5px);padding:12px 14px;border-radius:10px;
  border:1px solid var(--gold-line);background:rgba(7,10,18,.72);color:var(--cream);
  box-shadow:inset 0 2px 5px rgba(0,0,0,.5)}
.lookup-plate input:focus{border-color:var(--gold-bright);outline:none;
  box-shadow:inset 0 2px 5px rgba(0,0,0,.5),0 0 0 3px rgba(240,215,143,.16),0 0 26px -6px rgba(240,215,143,.4)}
.lookup-plate input::placeholder{color:var(--cream-soft);opacity:1;font-family:var(--serif);
  font-style:italic;letter-spacing:.04em;text-transform:none}
.lookup-plate .lp-go{min-height:46px;font-size:15.5px;letter-spacing:.08em;padding:12px 28px;border-radius:10px}
.lookup-plate .lp-hint{font-family:var(--serif);font-size:clamp(13px,.92rem,14.5px);line-height:1.55;
  color:var(--cream-soft);margin:11px 0 0}

/* landing method blocks ride the same .worlds chapter styling */
.ways{margin-top:clamp(32px,5vh,48px)}
.ways ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.ways li{font-size:clamp(14.5px,1.02rem,16.5px);line-height:1.55;color:var(--cream-soft)}
.ways li b{font-family:var(--label);font-weight:400;font-size:13px;letter-spacing:.12em;
  text-transform:uppercase;color:var(--gold-text);margin-right:.35ch}

/* ════════════════════════ MOTION PRIMITIVES ═══════════════════════════════ */
@keyframes v-fade-down{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:none}}
@keyframes v-fade-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
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

/* ═════════════════════════════ PRINT (paper again) ════════════════════════ */
@media print{
  :root{color-scheme:light}
  html,body{background:#FFF!important;color:#1A1610!important}
  .stage,.vignette,.grain,.progress,.hero__beams,.scrollcue,.skip{display:none!important}
  body::after{display:none!important}
  .hero{min-height:auto}
  .hero .type-title,.hero .verdict .word{color:#1A1610!important;-webkit-text-fill-color:#1A1610}
  .hero .verdict .sub,.world__copy,.trust,.explainer p,.foot{color:#3A352C!important}
  .status,.world,.panel,.filecheck{background:#FFF!important;border-color:#C9B88A!important;box-shadow:none!important}
  dl.grid dt,dl.grid dd{background:#FFF!important;color:#1A1610!important}
  .btn{display:none!important}
  a{color:#6B500F!important}
}`;
}
