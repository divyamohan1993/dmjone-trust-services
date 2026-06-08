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

import type {
  CredentialContent,
  CredentialRecord,
  LetterContent,
  Section63Metadata,
  UploadAttestation,
} from '@dmjone/shared';
import { documentKind, titleCase } from '@dmjone/shared';
import { getFontFaceCss } from './assets.js';
import { escapeHtml, formatIsoDate } from './html.js';

/** Human-readable label for a credential type (the machine code is internal). */
const TYPE_LABEL: Readonly<Record<string, string>> = {
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
 * The Part-1 "Identification of the Electronic Record" rows, kind-aware. The
 * legal structure (a labelled particulars table) and the surrounding Parts 2/3/A
 * + disclosure are identical across kinds; only WHICH identity rows appear vary:
 *
 *   - certificate → ID, nature (type label), recipient, title borne, date.
 *   - letter      → ID, nature ("Letterhead letter"), subject (if any),
 *                   recipient (first address line, if any), date.
 *   - upload      → ID, nature ("Uploaded document (attested)"), original file
 *                   name, original SHA-256 (the hash of the uploaded bytes BEFORE
 *                   stamping), page count, date.
 *
 * The id is `record.id` (= `credentialId` for certs, `documentId` for
 * letter/upload), so this never reaches into the union's differing id field. The
 * trailing "Current status" + "Stored as" rows are shared and appended by the
 * caller. Every value is HTML-escaped.
 */
function part1Rows(record: CredentialRecord): string {
  const id = `<span class="mono">${escapeHtml(record.id)}</span>`;
  switch (documentKind(record)) {
    case 'letter': {
      const c = record.content as LetterContent;
      const addressee = (c.recipientLines[0] ?? '').trim();
      const subject = (c.subject ?? '').trim();
      return (
        row('Document ID', id) +
        row('Nature of record', escapeHtml('Letterhead letter')) +
        (subject ? row('Subject', escapeHtml(subject)) : '') +
        (addressee ? row('Recipient', escapeHtml(addressee)) : '') +
        row('Date of issue', escapeHtml(formatIsoDate(c.issueDate)))
      );
    }
    case 'upload': {
      const c = record.content as UploadAttestation;
      return (
        row('Document ID', id) +
        row('Nature of record', escapeHtml('Uploaded document (attested)')) +
        row('Original file name', escapeHtml(c.originalFilename)) +
        row('Original SHA-256 (as uploaded)', `<span class="mono">${escapeHtml(c.originalSha256)}</span>`) +
        row('Pages', escapeHtml(String(c.pageCount))) +
        row('Date of issue', escapeHtml(formatIsoDate(c.issueDate)))
      );
    }
    default: {
      const c = record.content as CredentialContent;
      const typeLabel = TYPE_LABEL[c.type] ?? titleCase(c.type);
      return (
        row('Credential ID', `<span class="mono">${escapeHtml(c.credentialId)}</span>`) +
        row('Nature of record', escapeHtml(typeLabel)) +
        row('Recipient', escapeHtml(c.recipientName)) +
        row('Title borne', escapeHtml(`${c.kicker} ${c.title}`.trim())) +
        row('Date of issue', escapeHtml(formatIsoDate(c.issueDate)))
      );
    }
  }
}

/**
 * How the record is described in the "Stored as" row + Part 3 framing. The
 * delivered PDF carries NO embedded digital-signature object; it bears a stamped
 * validation identifier + QR, and its integrity/authenticity are bound by a
 * DETACHED ML-DSA-87 signature retained in the issuer&rsquo;s records and public
 * transparency log (described in the Issuer Trust Identity + Honest Disclosure
 * blocks below). An uploaded document is the uploader&rsquo;s PDF carrying our
 * stamp; a certificate/letter is rendered by us. The §63 disclosure (self-signed,
 * not a licensed CA) is unchanged for all.
 */
function storedAsCopy(kind: ReturnType<typeof documentKind>): string {
  if (kind === 'upload') {
    return 'A user-supplied PDF document (Portable Document Format, ISO 32000), stamped by the issuer with a validation identifier and QR, retained in the issuer&rsquo;s records. The document content is the uploader&rsquo;s.';
  }
  return 'A PDF document (Portable Document Format, ISO 32000), bearing a validation identifier and QR linking to the public verification service, retained in the issuer&rsquo;s records.';
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
  // The §63 certificate-of-authenticity applies to ANY electronic record. The
  // legal scaffold (Parts 2/3/A, disclosure, signatures) is shared; only the
  // Part-1 record-identity rows + the "Stored as" framing branch by kind. The
  // signatory block is on every kind's content; `record.id` is the id for all.
  const kind = documentKind(record);
  const signatory = (record.content as { signatory: CredentialContent['signatory'] }).signatory;
  // The authenticating identity for the DELIVERED record is the issuer's
  // post-quantum ML-DSA-87 signing key, NOT an embedded X.509/PKCS#7 signer
  // certificate (the delivered PDF embeds no signature object). Naming an X.509
  // subject here would imply a certificate-backed PDF signature we do not apply.
  //
  // BSA 2023 §63(4) requires the certificate be signed by BOTH a person in charge (Part A)
  // and an expert (Part B). LAWYER-REVIEW FLAG: by default the SAME operator self-attests as
  // the Part B technical expert. Any person with the requisite computer-science / cyber-
  // forensics expertise may validly sign Part B (subject to the court's satisfaction); whether,
  // in a contested matter, an expert who is NOT the operator should instead sign Part B is a
  // legal judgement to confirm with counsel.
  const issuerIdentity =
    'dmj.one Trust Services, Document Signing function (country: IN), signing with a post-quantum ML-DSA-87 (NIST FIPS 204) key held by the issuer';

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
          ${part1Rows(record)}
          ${row('Current status', escapeHtml(record.status === 'revoked' ? 'Revoked' : 'Valid'))}
          ${row('Stored as', storedAsCopy(kind))}
        </table>
      </div>

      <div class="sec">
        <h2>Part 2 &middot; Integrity Hash of the Electronic Record</h2>
        <table class="grid">
          ${row('Hash algorithm', escapeHtml(meta.hashAlgorithm))}
          ${row('Hash value (hex)', `<span class="mono">${escapeHtml(meta.hashValue)}</span>`)}
        </table>
        <p class="lede" style="margin-top:2.6mm; font-size:9.2pt; color:var(--ink-soft);">The hash above is computed over the complete delivered PDF, exactly as issued and retained by the issuer. Any alteration of a single bit of that document yields a different hash, by which tampering is detected. This same hash value is bound into the canonical record over which the detached ML-DSA-87 signature is computed, and is recorded in the issuer&rsquo;s public, append-only transparency log.</p>
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
        <h2>Part B &middot; Statement of the Expert (pre-filled)</h2>
        <div class="statement">
          <p>I, possessing special skills and technical expertise in computer systems and cryptographic methods, having examined the manner of production and the device particulars stated in Part 3, do hereby certify, to the best of my knowledge and belief, that:</p>
          <ol>
            <li>The computer system described in Part 3 is of a kind ordinarily used to produce electronic records of the nature identified in Part 1, and there is nothing before me to indicate that it was not operating properly during the material period.</li>
            <li>The methods stated in Part 3 &mdash; computation of a SHA-256 integrity hash and a detached post-quantum ML-DSA-87 (NIST FIPS&nbsp;204) signature over the canonical record of the document, with entry in a public, append-only transparency log &mdash; are technically sound and were applied to the said electronic record.</li>
            <li>The integrity hash stated in Part 2 is the SHA-256 hash of the delivered electronic record and correctly identifies it; any alteration of a single bit of that record would yield a different hash value.</li>
          </ol>
          <p style="margin-top:2.4mm; font-size:9.2pt; color:var(--ink-soft);">By default this Part B is completed by the operator named in Part A, who possesses the relevant technical expertise; consistent with the Honest Disclosure below, it is a self-attestation and not the certificate of an outside expert. Where the matter so requires, an expert who is not the operator may complete this Part.</p>
        </div>
      </div>

      <div class="sec">
        <h2>Issuer Trust Identity</h2>
        <p class="lede" style="font-size:9.6pt;">${escapeHtml(issuerIdentity)}. The delivered PDF carries no embedded digital-signature object; instead, the issuer computes a detached post-quantum ML-DSA-87 (NIST FIPS&nbsp;204) signature over the canonical record of this document &mdash; which includes the SHA-256 hash stated in Part 2 &mdash; and records the entry in a public, append-only transparency log whose successive heads are themselves ML-DSA-87 signed (a tamper-evident hash chain). Where external anchoring is enabled, each such head may additionally be published to a public GitHub repository (github.com/divyamohan1993/dmjone-trust-anchor), yielding an externally-hosted, publicly-timestamped commit record of the log&rsquo;s state. Anyone may check this, without a password, at verify.dmj.one (by scanning the stamped QR or entering the document identifier).</p>
      </div>

      <div class="disclosure">
        <h2>Honest Disclosure &middot; Nature &amp; Limits of this Attestation</h2>
        <p>dmj.one is an independent educational initiative; it is <strong>not</strong> a Government body, a recognised University, or a licensed Certifying Authority. The detached ML-DSA-87 signature over this record is a <strong>self-signed</strong> attestation by dmj.one: it evidences that this document was issued by dmj.one and has not been altered since, no more and no less. The delivered PDF contains <strong>no</strong> embedded digital-signature object. It is <strong>not</strong> a digital signature issued or certified by a Certifying Authority licensed under the Information Technology Act, 2000, and is not a &ldquo;secure electronic signature&rdquo; within the meaning of that Act; it therefore attracts no statutory presumption of authenticity or integrity (such as that available, for a secure electronic record or secure electronic signature, under Section 86 of the Bharatiya Sakshya Adhiniyam, 2023) and is offered as evidence to be weighed on its own merits. Tamper-evidence rests on the post-quantum ML-DSA-87 signature and on inclusion in a public, append-only transparency log: an ordered hash chain of ML-DSA-87-signed heads. Where external anchoring is enabled, the issuer additionally publishes each new signed head to a public GitHub repository (github.com/divyamohan1993/dmjone-trust-anchor), yielding an externally-hosted, publicly-timestamped commit record; because the log is an append-only chain of signed heads, any attempt to silently rewrite or back-date it then becomes detectable by anyone who has recorded an earlier head. This external publication is best-effort and non-blocking &mdash; the in-log signed head remains the primary evidence, and the per-document publication status (published or pending) is shown on the verification page. Authenticity may be checked by anyone, without any password, at <strong>verify.dmj.one</strong>.</p>
      </div>

      <div class="signrow">
        <div class="signbox">
          <div class="line"></div>
          <div class="who">For dmj.one Trust Services</div>
          <div class="meta">${escapeHtml(signatory.name)} &middot; ${escapeHtml(signatory.role)}</div>
          <div class="meta">Part A &middot; operator of the computer system</div>
        </div>
        <div class="signbox">
          <div class="line"></div>
          <div class="who">For dmj.one Trust Services</div>
          <div class="meta">${escapeHtml(signatory.name)} &middot; ${escapeHtml(signatory.role)}</div>
          <div class="meta">Part B &middot; technical expert (self-attested)</div>
        </div>
      </div>

      <div class="foot">dmj.one &middot; contact@dmj.one &middot; Verify at dmj.one/verify &middot; ${kind === 'certificate' ? 'Credential' : 'Document'} ID ${escapeHtml(record.id)}</div>

    </div>
  </div>
</body></html>`;
}
