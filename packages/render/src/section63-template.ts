/**
 * Pure HTML builder for the Bharatiya Sakshya Adhiniyam, 2023 — §63 Certificate
 * of Authenticity (the statutory certificate accompanying electronic-record
 * evidence in Indian courts).
 *
 * Distinct visual language from the ornamental certificate: this is a sober,
 * court-presentable legal instrument — same brand palette and font families,
 * but ruled sections, a particulars table, and signature blocks. It states the
 * record identity, the SHA-256 hash + value, the manner + device of production,
 * a pre-filled Part-A (operator) statement, the issuer trust identity, and an
 * HONEST disclosure of exactly what the cryptographic attestation is and is not.
 *
 * No I/O / no Chromium: a string builder, unit-testable on its own. Every
 * interpolated field is HTML-escaped.
 */

import type { CredentialRecord, CredentialType, Section63Metadata } from '@dmjone/shared';
import { getFontFaceCss } from './assets.js';
import { escapeHtml, formatIsoDate } from './html.js';

/** Human-readable label for a credential type (the machine code is internal). */
const TYPE_LABEL: Readonly<Record<CredentialType, string>> = {
  internship: 'Internship Certificate',
  completion: 'Certificate of Completion',
  appreciation: 'Certificate of Appreciation',
  experience: 'Experience Certificate',
  participation: 'Certificate of Participation',
};

/**
 * §63 document CSS. A formal legal instrument, not an ornamental certificate:
 * ruled headings + a particulars grid in the brand palette/fonts.
 *
 * It is deliberately a FLOWING multi-page document (a §63 certificate routinely
 * runs to two pages). Page margins come from `@page` so the top/bottom margin is
 * identical on every page; there is no absolutely-positioned frame (it cannot
 * span a page boundary cleanly) and no bottom-anchored flex (it assumes a single
 * fixed page). `break-inside:avoid` on each section / the disclosure / the
 * signature row guarantees a heading never strands at a page foot and the
 * signature block is never split across pages — at the cost of intentional
 * whitespace when a whole block moves to the next page.
 */
const SECTION63_CSS = `
  :root{
    --ink:#2B2A28; --ink-soft:#5C554D; --paper:#FFFDFB;
    --gold:#B0892F; --gold-deep:#876616; --gold-soft:#CBA85E;
    --serif:"EB Garamond",Georgia,serif;
    --display:"Playfair Display",Georgia,serif;
    --label:"Marcellus","EB Garamond",serif;
  }
  *{box-sizing:border-box; margin:0; padding:0;}
  /* Uniform margins on every page of the flowing document. */
  @page{ size:A4; margin:16mm 18mm; }
  html,body{ background:var(--paper); }
  body{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page{
    width:174mm; margin:0 auto; background:var(--paper);
    font-family:var(--serif); color:var(--ink); font-size:10.5pt; line-height:1.5;
  }
  .doc{ display:block; }

  /* masthead */
  .head{ text-align:center; border-bottom:.8pt solid var(--gold-soft); padding-bottom:5mm; margin-bottom:5mm; }
  .head .org{ font-family:var(--label); font-size:13pt; letter-spacing:.16em;
    text-transform:uppercase; color:var(--gold-deep); }
  .head .sub{ font-family:var(--label); font-size:7.6pt; letter-spacing:.18em;
    text-transform:uppercase; color:var(--ink-soft); margin-top:1.6mm; }
  .head .act{ font-family:var(--serif); font-size:8.4pt; color:var(--ink-soft); margin-top:3mm; }
  .head .title{ font-family:var(--display); font-weight:700; font-size:17pt;
    letter-spacing:.03em; color:var(--ink); margin-top:3.5mm; line-height:1.15; }
  .head .title small{ display:block; font-family:var(--label); font-weight:400;
    font-size:9pt; letter-spacing:.20em; text-transform:uppercase; color:var(--gold); margin-top:1.6mm; }

  /* Sections flow freely (no whole-section avoid — that wastes the foot of a
     page and orphans the tail onto a third page). Atomicity is enforced at the
     row level instead, so a table breaks cleanly BETWEEN rows. */
  .sec{ margin-top:5mm; }
  .sec > h2{ font-family:var(--label); font-size:9.5pt; letter-spacing:.14em;
    text-transform:uppercase; color:var(--gold-deep); border-bottom:.5pt solid var(--gold-soft);
    padding-bottom:1.2mm; margin-bottom:2.6mm; break-after:avoid; }
  .lede{ font-size:10pt; line-height:1.55; }

  table.grid{ width:100%; border-collapse:collapse; }
  /* A row never splits across a page; the table may break between rows. */
  table.grid tr{ break-inside:avoid; }
  table.grid th, table.grid td{ text-align:left; vertical-align:top; padding:1.7mm 2.4mm;
    border:.4pt solid var(--gold-soft); }
  table.grid th{ font-family:var(--label); font-size:8.6pt; letter-spacing:.04em;
    color:var(--ink-soft); width:40mm; font-weight:400; background:rgba(176,137,47,.045); }
  table.grid td{ font-size:10pt; color:var(--ink); }
  td .mono{ font-family:"Courier New",monospace; font-size:8.6pt; letter-spacing:0;
    word-break:break-all; color:var(--ink); }

  .statement{ font-size:9.8pt; line-height:1.6; }
  .statement ol{ margin:2mm 0 0 6mm; padding:0; }
  .statement li{ margin-bottom:1.8mm; }

  .disclosure{ margin-top:5mm; padding:3.4mm 4mm; border:.5pt solid var(--gold-soft);
    background:rgba(176,137,47,.04); border-radius:1mm; break-inside:avoid; }
  .disclosure h2{ font-family:var(--label); font-size:9pt; letter-spacing:.12em;
    text-transform:uppercase; color:var(--gold-deep); margin-bottom:1.8mm; }
  .disclosure p{ font-size:9.2pt; line-height:1.55; color:var(--ink-soft); }

  .signrow{ display:flex; justify-content:space-between; gap:10mm; margin-top:10mm; break-inside:avoid; }
  .signbox{ flex:1; }
  .signbox .line{ height:.7pt; background:var(--ink); opacity:.5; margin-bottom:1.6mm; }
  .signbox .who{ font-family:var(--label); font-size:8.6pt; letter-spacing:.06em; color:var(--ink); }
  .signbox .meta{ font-size:8.6pt; color:var(--ink-soft); margin-top:.6mm; }

  .foot{ text-align:center; margin-top:6mm; padding-top:3mm; border-top:.5pt solid var(--gold-soft);
    font-family:var(--label); font-size:7.4pt; letter-spacing:.10em; color:var(--ink-soft); }
`;

/** One labelled row of the particulars grid. */
function row(label: string, valueHtml: string): string {
  return `<tr><th>${escapeHtml(label)}</th><td>${valueHtml}</td></tr>`;
}

/**
 * Build the §63 certificate HTML for a stored credential record. Pulls the
 * record-identity fields from {@link CredentialRecord.content} and the hash /
 * production particulars from the supplied {@link Section63Metadata} (already
 * computed by the generator's `metadata()`), so generation never recomputes the
 * hash.
 */
export function buildSection63Html(record: CredentialRecord, meta: Section63Metadata): string {
  const fontCss = getFontFaceCss();
  const { content } = record;

  const typeLabel = TYPE_LABEL[content.type];
  const issuerIdentity =
    'dmj.one Trust Services — Document Signing (X.509 subject CN=dmj.one Trust Services, OU=Document Signing, C=IN)';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<style>
${fontCss}
${SECTION63_CSS}
</style></head>
<body>
  <div class="page">
    <div class="doc">

      <div class="head">
        <div class="org">dmj.one Trust Services</div>
        <div class="sub">Independent Educational Initiative &middot; Document Trust Services</div>
        <div class="act">Under the Bharatiya Sakshya Adhiniyam, 2023 (Act 47 of 2023), Section 63 &mdash; admissibility of electronic records</div>
        <div class="title">Certificate of Authenticity<small>Section 63 &middot; Electronic Record</small></div>
      </div>

      <div class="sec">
        <p class="lede">This certificate is issued under Section 63 of the Bharatiya Sakshya Adhiniyam, 2023, in respect of the electronic record described below. It identifies the record, states the manner in which it was produced and the particulars of the device(s) involved, and records the cryptographic hash by which the integrity of the record may be independently verified.</p>
      </div>

      <div class="sec">
        <h2>Part 1 &middot; Identification of the Electronic Record</h2>
        <table class="grid">
          ${row('Credential ID', `<span class="mono">${escapeHtml(content.credentialId)}</span>`)}
          ${row('Nature of record', escapeHtml(typeLabel))}
          ${row('Recipient', escapeHtml(content.recipientName))}
          ${row('Title borne', escapeHtml(`${content.kicker} ${content.title}`.trim()))}
          ${row('Date of issue', escapeHtml(formatIsoDate(content.issueDate)))}
          ${row('Current status', escapeHtml(record.status === 'revoked' ? 'Revoked' : 'Valid'))}
          ${row('Stored as', 'A digitally-signed PDF document (Portable Document Format, ISO 32000) retained in the issuer&rsquo;s records.')}
        </table>
      </div>

      <div class="sec">
        <h2>Part 2 &middot; Integrity Hash of the Electronic Record</h2>
        <table class="grid">
          ${row('Hash algorithm', escapeHtml(meta.hashAlgorithm))}
          ${row('Hash value (hex)', `<span class="mono">${escapeHtml(meta.hashValue)}</span>`)}
        </table>
        <p class="lede" style="margin-top:2.6mm; font-size:9.2pt; color:var(--ink-soft);">The hash above is computed over the complete, digitally-signed PDF as retained by the issuer. Any alteration of a single bit of that document yields a different hash, by which tampering is detected. The same value is published in the issuer&rsquo;s append-only transparency log.</p>
      </div>

      <div class="sec">
        <h2>Part 3 &middot; Manner of Production &amp; Device Particulars</h2>
        <table class="grid">
          ${row('Produced by', escapeHtml(meta.producedBy))}
          ${row('Method of production', escapeHtml(meta.productionMethod))}
          ${row('Device particulars', escapeHtml(meta.deviceParticulars))}
          ${row('Certificate generated at', escapeHtml(meta.generatedAt))}
        </table>
      </div>

      <div class="sec">
        <h2>Part A &middot; Statement of the Person Operating the Computer (pre-filled)</h2>
        <div class="statement">
          <p>I, the person lawfully in charge of the computer output and the activities relating to the said electronic record on behalf of dmj.one Trust Services, do hereby state that:</p>
          <ol>
            <li>The electronic record identified in Part 1 was produced by the computer system described in Part 3 in the ordinary course of the activities of dmj.one.</li>
            <li>Throughout the material period the said computer system was operating properly, and the contents of the electronic record were not affected by any improper operation of the computer.</li>
            <li>The information contained in the electronic record reproduces, and is derived from, information supplied to the computer system in the ordinary course of the said activities.</li>
            <li>The integrity hash stated in Part 2 was computed over the said electronic record by the means described in Part 3, and correctly identifies it.</li>
          </ol>
        </div>
      </div>

      <div class="sec">
        <h2>Issuer Trust Identity</h2>
        <p class="lede" style="font-size:9.6pt;">${escapeHtml(issuerIdentity)}. The signed PDF carries an embedded PAdES (PKCS#7) signature object bearing this subject, and a detached post-quantum ML-DSA-87 (NIST FIPS&nbsp;204) signature covering the document hash, retained in the issuer&rsquo;s records and transparency log.</p>
      </div>

      <div class="disclosure">
        <h2>Honest Disclosure &middot; Nature &amp; Limits of this Attestation</h2>
        <p>dmj.one is an independent educational initiative; it is <strong>not</strong> a Government body, a recognised University, or a licensed Certifying Authority. The cryptographic signatures on the record are <strong>self-signed</strong> attestations by dmj.one: they prove that this credential was issued by dmj.one and has not been altered. They are <strong>not</strong> a digital signature backed by a licensed Certifying Authority under the Information Technology Act, 2000, and therefore do not carry the statutory presumption attaching to such signatures. Tamper-evidence is provided by the post-quantum ML-DSA-87 signature together with a public, append-only transparency log; authenticity may be verified independently and without any password at the issuer&rsquo;s verification service.</p>
      </div>

      <div class="signrow">
        <div class="signbox">
          <div class="line"></div>
          <div class="who">For dmj.one Trust Services</div>
          <div class="meta">${escapeHtml(content.signatory.name)} &middot; ${escapeHtml(content.signatory.role)}</div>
          <div class="meta">Part A &middot; operator of the computer system</div>
        </div>
        <div class="signbox">
          <div class="line"></div>
          <div class="who">Part B &middot; to be completed on presentation</div>
          <div class="meta">Signature of the person tendering the record in evidence,</div>
          <div class="meta">with name, designation, date and place.</div>
        </div>
      </div>

      <div class="foot">dmj.one &middot; contact@dmj.one &middot; Verify at dmj.one/verify &middot; Credential ID ${escapeHtml(content.credentialId)}</div>

    </div>
  </div>
</body></html>`;
}
