/**
 * Pure HTML builder for the dmj.one **letterhead letter** (Mode 2).
 *
 * Unlike the ornamental certificate (a single, absolutely-framed A4 page), a
 * letter is a FLOWING multi-page document: long correspondence routinely runs
 * to several pages. It therefore borrows the §63 template's page model — page
 * margins from `@page` (identical top/bottom on every page), no absolutely
 * positioned frame, and `break-inside:avoid` on the signature block so the
 * "For dmj.one" + signature image + footer never split across a page boundary —
 * rather than the cert's bottom-anchored flex (which assumes one fixed page).
 *
 * It reuses the brand palette + the four serif `@font-face` (base64, via
 * {@link getFontFaceCss}) and the brand images (logo + signature, via
 * {@link getBrandImages}) so the document renders with zero network access, and
 * compiles each rich body paragraph through {@link compileParagraph} (the same
 * `[[align:…]]` directive + `**`/`*`/`__` inline grammar as the cert body),
 * defaulting to justified. The signature block markup mirrors the cert's
 * `.sig` block. Every interpolated field is HTML-escaped.
 *
 * No I/O and no Chromium here: a string builder, unit-testable on its own.
 */

import type { LetterContent } from '@dmjone/shared';
import { getBrandImages, getFontFaceCss } from './assets.js';
import { compileParagraph, escapeHtml, formatIsoDate } from './html.js';

/** What the builder needs beyond the content: the QR target, pre-rendered to a data-URI. */
export interface LetterTemplateInput {
  content: LetterContent;
  /** QR code PNG as a `data:image/png;base64,...` URI (encodes the public document URL). */
  qrDataUri: string;
}

/**
 * The letter CSS. Same brand palette/fonts as the certificate, but laid out as
 * a sober, flowing business letter on dmj.one letterhead.
 *
 * Deliberately FLOWING and multi-page (long letters span pages): page margins
 * live in `@page` so every page shares the same top/bottom margin; there is no
 * absolutely-positioned frame (it cannot cross a page boundary) and no
 * bottom-anchored flex. `break-inside:avoid` on `.sigblock` keeps the
 * signature whole; on `.masthead` so the letterhead never strands its contact
 * line; and on `.verifycard` so the footer verify line + QR card stay together.
 * The body's per-paragraph alignment reuses the cert's four blessed `pa-*`
 * classes (the class is always one of those literals, never user data — CSP-safe).
 */
const LETTER_CSS = `
  :root{
    --ink:#2B2A28; --ink-soft:#5C554D; --paper:#FFFDFB;
    --gold:#B0892F; --gold-deep:#876616; --gold-soft:#CBA85E;
    --serif:"EB Garamond",Georgia,serif;
    --display:"Playfair Display",Georgia,serif;
    --label:"Marcellus","EB Garamond",serif;
  }
  *{box-sizing:border-box; margin:0; padding:0;}
  /* Uniform margins on every page of the flowing letter. */
  @page{ size:A4; margin:18mm 20mm; }
  html,body{ background:var(--paper); }
  body{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page{
    width:170mm; margin:0 auto; background:var(--paper);
    font-family:var(--serif); color:var(--ink); font-size:11pt; line-height:1.55;
  }

  /* ===== masthead / letterhead ===== */
  .masthead{ display:flex; align-items:center; gap:6mm;
    border-bottom:.8pt solid var(--gold-soft); padding-bottom:4.5mm; margin-bottom:5mm;
    break-inside:avoid; }
  .masthead .logo{ width:22mm; height:22mm; display:block; flex:0 0 auto;
    filter:drop-shadow(0 1mm 1.8mm rgba(120,90,40,.16)); }
  .masthead .ident{ flex:1; }
  .masthead .org{ font-family:var(--display); font-weight:700; font-size:18pt;
    letter-spacing:.02em; color:var(--ink); line-height:1.1; }
  .masthead .descriptor{ font-family:var(--label); font-size:8.4pt; letter-spacing:.20em;
    text-transform:uppercase; color:var(--gold-deep); margin-top:1.4mm; }
  .masthead .contact{ font-family:var(--label); font-size:8pt; letter-spacing:.10em;
    color:var(--ink-soft); margin-top:1.4mm; }

  /* ===== ref / date row ===== */
  .refrow{ display:flex; justify-content:space-between; font-family:var(--label);
    font-size:9pt; letter-spacing:.05em; color:var(--ink-soft); margin-bottom:6mm; }
  .refrow .ref{ text-align:left; }
  .refrow .date{ text-align:right; }

  /* ===== recipient block ===== */
  .recipient{ margin-bottom:5mm; }
  .recipient .line{ font-family:var(--serif); font-size:10.6pt; color:var(--ink);
    line-height:1.45; }

  /* ===== subject / salutation ===== */
  .subject{ font-family:var(--serif); font-weight:600; font-size:11pt; color:var(--ink);
    margin-bottom:4mm; }
  .salutation{ font-family:var(--serif); font-size:11pt; color:var(--ink);
    margin-bottom:3.5mm; }

  /* ===== body ===== */
  .body{ text-align:justify; text-justify:inter-word; }
  .body p{ font-family:var(--serif); font-size:11pt; line-height:1.62; color:var(--ink);
    margin-bottom:3mm; }
  .body strong{ font-weight:600; }
  .body em{ font-style:italic; }
  .body u{ text-decoration:underline; }
  /* per-paragraph alignment — the four blessed classes (never user data, CSP-safe);
     the container's justify stays the inherited default so pa-justify and
     legacy pref-less paragraphs render identically. */
  .body p.pa-left{ text-align:left; }
  .body p.pa-center{ text-align:center; }
  .body p.pa-right{ text-align:right; }
  .body p.pa-justify{ text-align:justify; text-justify:inter-word; }

  /* ===== valediction + signature block (kept whole across page breaks) ===== */
  .sigblock{ margin-top:9mm; break-inside:avoid; }
  .sigblock .valediction{ font-family:var(--serif); font-size:11pt; color:var(--ink);
    margin-bottom:1mm; }
  .sigblock .forline{ font-family:var(--label); font-size:9pt; letter-spacing:.24em;
    text-transform:uppercase; color:var(--gold-deep); margin-bottom:1mm; }
  .sigblock .sig-img{ display:block; height:14mm; width:auto; margin:1mm 0 -2mm 3mm; }
  .sigblock .rule{ width:62mm; height:.8pt; background:var(--ink); opacity:.55; margin:1mm 0 1.6mm; }
  .sigblock .name{ font-family:var(--label); font-size:10.5pt; letter-spacing:.10em; color:var(--ink); }
  .sigblock .role{ font-family:var(--serif); font-style:italic; font-size:10pt; color:var(--ink-soft); margin-top:.4mm; }
  .sigblock .phone{ font-family:var(--label); font-size:9pt; letter-spacing:.06em; color:var(--ink-soft); margin-top:.6mm; }

  /* ===== footer: verify line + QR card (kept together) ===== */
  .foot{ margin-top:10mm; padding-top:4mm; border-top:.6pt solid var(--gold-soft); }
  .verifycard{ display:flex; align-items:center; gap:5mm; break-inside:avoid; }
  .verifycard .qr{ width:20mm; height:20mm; padding:1.6mm; background:#fff;
    border:.8pt solid var(--gold-soft); border-radius:1.2mm; flex:0 0 auto;
    box-shadow:0 1mm 2mm rgba(120,90,40,.12); }
  .verifycard .qr img{ width:100%; height:100%; display:block; }
  .verifycard .vtext{ flex:1; }
  .verifycard .vtext .lbl{ font-family:var(--label); font-size:8.4pt; letter-spacing:.16em;
    text-transform:uppercase; color:var(--gold-deep); }
  .verifycard .vtext .url{ font-family:var(--label); font-size:9pt; letter-spacing:.06em;
    color:var(--ink-soft); margin-top:1mm; }
  .verifycard .vtext .url b{ color:var(--gold-deep); font-weight:400; }
  .foot .motto{ font-family:var(--label); font-size:8pt; letter-spacing:.18em;
    text-transform:uppercase; color:var(--ink-soft); text-align:center; margin-top:4mm; }
`;

/**
 * Build the complete letterhead-letter HTML document with every placeholder
 * filled from {@link LetterContent}. Returns a self-contained string (fonts +
 * images + QR all inlined); no network reference remains. Every interpolated
 * field is HTML-escaped; body paragraphs are compiled through the shared
 * rich-text grammar.
 */
export function buildLetterHtml(input: LetterTemplateInput): string {
  const { content, qrDataUri } = input;
  const images = getBrandImages();
  const fontCss = getFontFaceCss();

  const documentId = escapeHtml(content.documentId);
  const issueDate = escapeHtml(formatIsoDate(content.issueDate));
  const sigName = escapeHtml(content.signatory.name);
  const sigRole = escapeHtml(content.signatory.role);
  const sigPhone = escapeHtml(content.signatory.phone);

  // Optional reference: shown only when present and non-empty.
  const reference = content.reference !== undefined ? content.reference.trim() : '';
  const refHtml = reference.length > 0 ? `Ref: ${escapeHtml(reference)}` : '';

  // Recipient address block: one escaped line each (each <p>-like line).
  const recipientHtml = content.recipientLines
    .map((line) => `<div class="line">${escapeHtml(line)}</div>`)
    .join('');

  // Optional bold Subject line.
  const subject = content.subject !== undefined ? content.subject.trim() : '';
  const subjectHtml =
    subject.length > 0 ? `<div class="subject">Subject: ${escapeHtml(subject)}</div>` : '';

  // Optional salutation.
  const salutation = content.salutation !== undefined ? content.salutation.trim() : '';
  const salutationHtml =
    salutation.length > 0 ? `<div class="salutation">${escapeHtml(salutation)}</div>` : '';

  // Rich body paragraphs: each compiled through the shared grammar (§2 align
  // directive stripped to one of the four pa-* literals, the remainder escaped
  // FIRST, then the inline marks compiled to <strong>/<em>/<u>). The class is
  // always one of four fixed literals (never user data), so its interpolation
  // is safe (CSP-safe — no inline style attribute is ever emitted).
  const bodyParas = content.bodyParagraphs
    .map((p) => {
      const { html, alignClass } = compileParagraph(p);
      return `<p class="${alignClass}">${html}</p>`;
    })
    .join('');

  // Optional valediction (e.g. "Sincerely,").
  const valediction = content.valediction !== undefined ? content.valediction.trim() : '';
  const valedictionHtml =
    valediction.length > 0
      ? `<div class="valediction">${escapeHtml(valediction)}</div>`
      : '';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<style>
${fontCss}
${LETTER_CSS}
</style></head>
<body>
  <div class="page">

    <!-- ===== MASTHEAD / LETTERHEAD ===== -->
    <div class="masthead">
      <img class="logo" src="${images.logo}" alt="dmj.one">
      <div class="ident">
        <div class="org">dmj.one</div>
        <div class="descriptor">Educational Platform &middot; Independent Learning Initiative</div>
        <div class="contact">dmj.one &nbsp;&middot;&nbsp; contact@dmj.one &nbsp;&middot;&nbsp; +91 79799 30293</div>
      </div>
    </div>

    <!-- ===== REF / DATE ===== -->
    <div class="refrow"><span class="ref">${refHtml}</span><span class="date">Date of Issue: ${issueDate}</span></div>

    <!-- ===== RECIPIENT ===== -->
    <div class="recipient">${recipientHtml}</div>

    <!-- ===== SUBJECT / SALUTATION ===== -->
    ${subjectHtml}
    ${salutationHtml}

    <!-- ===== BODY ===== -->
    <div class="body">${bodyParas}</div>

    <!-- ===== VALEDICTION + SIGNATURE ===== -->
    <div class="sigblock">
      ${valedictionHtml}
      <div class="forline">For dmj.one</div>
      <img class="sig-img" src="${images.signature}" alt="Signature">
      <div class="rule"></div>
      <div class="name">${sigName}</div>
      <div class="role">${sigRole}</div>
      <div class="phone">${sigPhone}</div>
    </div>

    <!-- ===== FOOTER: VERIFY + QR ===== -->
    <div class="foot">
      <div class="verifycard">
        <div class="qr"><img src="${qrDataUri}" alt="QR code to verify this document"></div>
        <div class="vtext">
          <div class="lbl">Scan to verify &middot; dmj.one Trusted Document</div>
          <div class="url">Verify this document at <b>verify.dmj.one</b> &nbsp;&middot;&nbsp; Document ID: ${documentId}</div>
        </div>
      </div>
      <div class="motto">Dream &middot; Manifest &middot; Journey &middot; Together as One</div>
    </div>

  </div>
</body></html>`;
}
