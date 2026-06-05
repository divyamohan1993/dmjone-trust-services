/**
 * Pure HTML builder for the pixel-faithful certificate.
 *
 * This reproduces `assets/dmj_one_letterhead_TEMPLATE.html` exactly — the same
 * CSS (gold double frame + diamond corners, watercolour wash, watermark,
 * masthead, ref row, kicker + title, italic intro + underlined recipient,
 * justified body, signature block with the signature image, QR card, footer) —
 * with two differences mandated by the offline/no-network rule:
 *
 *   1. the Google Fonts `<link>` is gone; the four families are embedded as
 *      base64 `@font-face` data-URIs (see {@link getFontFaceCss});
 *   2. the three images and the QR are inlined as base64 data-URIs.
 *
 * No I/O and no Chromium here: this is a string builder, unit-testable on its
 * own. Every interpolated field is HTML-escaped.
 */

import type { CredentialContent } from '@dmjone/shared';
import { getBrandImages, getFontFaceCss } from './assets.js';
import { escapeHtml, escapeHtmlWithEmphasis, formatIsoDate } from './html.js';

/** What the builder needs beyond the content: the QR target, pre-rendered to a data-URI. */
export interface CertificateTemplateInput {
  content: CredentialContent;
  /** QR code PNG as a `data:image/png;base64,...` URI (encodes the public credential URL). */
  qrDataUri: string;
}

/**
 * The certificate CSS, copied verbatim from the template's `<style>` block.
 * Kept byte-for-byte so the rendered appearance matches the reference; the only
 * thing prepended at build time is the embedded @font-face block.
 */
const CERTIFICATE_CSS = `
  :root{
    --ink:#2B2A28; --ink-soft:#5C554D; --paper:#FFFDFB;
    --gold:#B0892F; --gold-deep:#876616; --gold-soft:#CBA85E;
    --serif:"EB Garamond",Georgia,serif;
    --display:"Playfair Display",Georgia,serif;
    --label:"Marcellus","EB Garamond",serif;
    --script:"Great Vibes",cursive;
  }
  *{box-sizing:border-box; margin:0; padding:0;}
  @page{ size:A4; margin:0; }
  html,body{ background:#d8d8d8; }
  body{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page{
    position:relative; width:210mm; height:297mm; margin:0 auto;
    background:var(--paper); overflow:hidden;
    display:flex; flex-direction:column; padding:21mm 23mm 16mm;
    font-family:var(--serif); color:var(--ink);
  }
  /* soft watercolour corners echoing the logo */
  .wash{ position:absolute; inset:0; pointer-events:none; z-index:0;
    background:
      radial-gradient(58% 40% at 0% 0%,   rgba(243,205,210,.42), transparent 60%),
      radial-gradient(50% 36% at 100% 0%, rgba(214,210,235,.38), transparent 60%),
      radial-gradient(56% 38% at 100% 100%,rgba(248,224,205,.42), transparent 62%),
      radial-gradient(48% 32% at 0% 100%, rgba(238,210,222,.34), transparent 60%);
  }
  .watermark{ position:absolute; top:53%; left:50%; transform:translate(-50%,-50%);
    width:150mm; opacity:.07; z-index:1; pointer-events:none; }
  /* fine double gold frame */
  .frame{ position:absolute; inset:8mm; border:1.4pt solid var(--gold); z-index:1; pointer-events:none; }
  .frame::before{ content:""; position:absolute; inset:1.5mm; border:.5pt solid var(--gold-soft); }
  .corner{ position:absolute; width:3.4mm; height:3.4mm; background:var(--gold);
    transform:rotate(45deg); z-index:2; }
  .corner.tl{ top:calc(8mm - 1.7mm); left:calc(8mm - 1.7mm);}
  .corner.tr{ top:calc(8mm - 1.7mm); right:calc(8mm - 1.7mm);}
  .corner.bl{ bottom:calc(8mm - 1.7mm); left:calc(8mm - 1.7mm);}
  .corner.br{ bottom:calc(8mm - 1.7mm); right:calc(8mm - 1.7mm);}

  .content{ position:relative; z-index:3; display:flex; flex-direction:column; flex:1; text-align:center; }

  /* masthead */
  .logo{ width:31mm; height:31mm; margin:0 auto 3.2mm; display:block;
    filter:drop-shadow(0 1.2mm 2.2mm rgba(120,90,40,.16)); }
  .descriptor{ font-family:var(--label); font-size:9.5pt; letter-spacing:.30em;
    text-transform:uppercase; color:var(--gold-deep); }
  .contact-top{ font-family:var(--label); font-size:8pt; letter-spacing:.16em;
    color:var(--ink-soft); margin-top:2.2mm; }

  .flourish{ display:flex; align-items:center; justify-content:center; gap:3mm; margin:5mm auto; }
  .flourish .ln{ height:.5pt; width:26mm;
    background:linear-gradient(90deg,transparent,var(--gold-soft),var(--gold)); }
  .flourish .ln.r{ background:linear-gradient(90deg,var(--gold),var(--gold-soft),transparent); }
  .flourish .dot{ width:2mm; height:2mm; background:var(--gold); transform:rotate(45deg); }

  .refrow{ display:flex; justify-content:space-between; font-family:var(--label);
    font-size:9pt; letter-spacing:.06em; color:var(--ink-soft); margin-bottom:1mm; }

  .title-kicker{ font-family:var(--label); font-size:10pt; letter-spacing:.42em;
    text-transform:uppercase; color:var(--gold); margin-top:2mm; }
  .title-main{ font-family:var(--display); font-weight:700; font-size:31pt;
    letter-spacing:.10em; text-transform:uppercase; color:var(--ink); line-height:1.05; margin-top:1.5mm; }

  .intro{ font-family:var(--serif); font-style:italic; font-size:12.5pt;
    color:var(--ink-soft); margin-top:7mm; }
  .recipient{ font-family:var(--display); font-weight:600; font-size:25pt;
    color:var(--ink); margin-top:2.5mm; display:inline-block; }
  .recipient-wrap{ margin:0 auto; }
  .recipient .u{ display:inline-block; padding-bottom:1.5mm;
    border-bottom:.9pt solid var(--gold-soft); }

  .body{ max-width:152mm; margin:7mm auto 0; text-align:justify; text-justify:inter-word; }
  .body p{ font-family:var(--serif); font-size:11.5pt; line-height:1.62; color:var(--ink);
    margin-bottom:2.6mm; }
  .body strong{ font-weight:600; }
  .wish{ text-align:center !important; font-style:italic; color:var(--ink-soft) !important;
    font-size:12pt !important; margin-top:1.5mm; }

  /* signature + QR */
  .sigrow{ display:flex; justify-content:space-between; align-items:flex-end;
    margin-top:auto; padding-top:9mm; text-align:left; }
  .sig .forline{ font-family:var(--label); font-size:9pt; letter-spacing:.24em;
    text-transform:uppercase; color:var(--gold-deep); margin-bottom:1mm; }
  .sig .sig-img{ display:block; height:14mm; width:auto; margin:1mm 0 -2mm 3mm; }
  .sig .rule{ width:62mm; height:.8pt; background:var(--ink); opacity:.55; margin:1mm 0 1.6mm; }
  .sig .name{ font-family:var(--label); font-size:10.5pt; letter-spacing:.10em; color:var(--ink); }
  .sig .role{ font-family:var(--serif); font-style:italic; font-size:10pt; color:var(--ink-soft); margin-top:.4mm; }
  .sig .phone{ font-family:var(--label); font-size:9pt; letter-spacing:.06em; color:var(--ink-soft); margin-top:.6mm; }

  .qr{ text-align:center; }
  .qr .card{ width:24mm; height:24mm; padding:2mm; background:#fff;
    border:.8pt solid var(--gold-soft); border-radius:1.4mm;
    box-shadow:0 1mm 2mm rgba(120,90,40,.12); }
  .qr .card img{ width:100%; height:100%; display:block; }
  .qr .lbl{ font-family:var(--label); font-size:7.6pt; letter-spacing:.20em;
    text-transform:uppercase; color:var(--ink-soft); margin-top:1.6mm; }

  /* footer */
  .foot{ position:relative; z-index:3; text-align:center; margin-top:7mm; }
  .foot .motto{ font-family:var(--label); font-size:10.5pt; letter-spacing:.28em;
    text-transform:uppercase; color:var(--gold-deep); }
  .foot .contact{ font-family:var(--label); font-size:8pt; letter-spacing:.14em;
    color:var(--ink-soft); margin-top:2.2mm; }
  .foot .verify{ font-family:var(--label); font-size:8pt; letter-spacing:.10em;
    color:var(--ink-soft); margin-top:2mm; }
  .foot .verify b{ color:var(--gold-deep); font-weight:400; }
  .foot .disclosure{ font-family:var(--serif); font-style:italic; font-size:7.8pt;
    color:var(--ink-soft); margin:1.3mm auto 0; max-width:150mm; line-height:1.4; }
`;

/**
 * Build the complete certificate HTML document with every placeholder filled
 * from {@link CredentialContent}. Returns a self-contained string (fonts +
 * images + QR all inlined); no network reference remains.
 */
export function buildCertificateHtml(input: CertificateTemplateInput): string {
  const { content, qrDataUri } = input;
  const images = getBrandImages();
  const fontCss = getFontFaceCss();

  const credentialId = escapeHtml(content.credentialId);
  const issueDate = escapeHtml(formatIsoDate(content.issueDate));
  const kicker = escapeHtml(content.kicker);
  const title = escapeHtml(content.title);
  const intro = escapeHtml(content.intro);
  const recipient = escapeHtml(content.recipientName);
  const sigName = escapeHtml(content.signatory.name);
  const sigRole = escapeHtml(content.signatory.role);
  const sigPhone = escapeHtml(content.signatory.phone);

  // Body paragraphs: escaped text (one <p> each), with a bounded `**word**` →
  // <strong> markup compiled for display (the reference cert bolds key terms).
  // Everything outside the `**` markers stays HTML-escaped. The optional closing
  // line reuses the template's .wish <p> (plain escape — bold not requested there).
  const bodyParas = content.bodyParagraphs
    .map((p) => `<p>${escapeHtmlWithEmphasis(p)}</p>`)
    .join('');
  const wish =
    content.closingLine !== undefined && content.closingLine.length > 0
      ? `<p class="wish">${escapeHtml(content.closingLine)}</p>`
      : '';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<style>
${fontCss}
${CERTIFICATE_CSS}
</style></head>
<body>
  <div class="page">
    <div class="wash"></div>
    <img class="watermark" src="${images.watermark}" alt="">
    <div class="frame"></div>
    <span class="corner tl"></span><span class="corner tr"></span>
    <span class="corner bl"></span><span class="corner br"></span>

    <div class="content">
      <!-- ===== MASTHEAD ===== -->
      <img class="logo" src="${images.logo}" alt="dmj.one">
      <div class="descriptor">Educational Platform &middot; Independent Learning Initiative</div>
      <div class="contact-top">dmj.one &nbsp;&middot;&nbsp; contact@dmj.one &nbsp;&middot;&nbsp; +91 79799 30293</div>

      <div class="flourish"><span class="ln"></span><span class="dot"></span><span class="ln r"></span></div>

      <!-- ===== REF / DATE ===== -->
      <div class="refrow"><span>Credential ID: ${credentialId}</span><span>Date of Issue: ${issueDate}</span></div>

      <!-- ===== TITLE ===== -->
      <div class="title-kicker">${kicker}</div>
      <div class="title-main">${title}</div>

      <!-- ===== BODY ===== -->
      <div class="intro">${intro}</div>
      <div class="recipient-wrap"><div class="recipient"><span class="u">${recipient}</span></div></div>

      <div class="body">${bodyParas}${wish}</div>

      <!-- ===== SIGNATURE + QR ===== -->
      <div class="sigrow">
        <div class="sig">
          <div class="forline">For dmj.one</div>
          <img class="sig-img" src="${images.signature}" alt="Signature">
          <div class="rule"></div>
          <div class="name">${sigName}</div>
          <div class="role">${sigRole}</div>
          <div class="phone">${sigPhone}</div>
        </div>
        <div class="qr">
          <div class="card"><img src="${qrDataUri}" alt="QR code to verify this credential"></div>
          <div class="lbl">Scan to verify</div>
        </div>
      </div>
    </div>

    <!-- ===== FOOTER ===== -->
    <div class="foot">
      <div class="motto">Dream &middot; Manifest &middot; Journey &middot; Together as One</div>
      <div class="verify">Verify this credential at <b>dmj.one/verify</b> &nbsp;&middot;&nbsp; Credential ID: ${credentialId}</div>
      <div class="disclosure">Issued by dmj.one, an independent educational initiative.</div>
      <div class="contact">dmj.one &nbsp;&middot;&nbsp; contact@dmj.one &nbsp;&middot;&nbsp; +91 79799 30293</div>
    </div>
  </div>
</body></html>`;
}
