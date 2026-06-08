import { describe, it, expect } from 'vitest';
import { buildSection63Html } from '../src/section63-template.js';
import { createSection63Generator } from '../src/section63.js';
import { SAMPLE_RECORD, SAMPLE_SECTION63, SAMPLE_CONTENT } from './fixtures.js';
import type { CredentialRecord, LetterContent, UploadAttestation } from '@dmjone/shared';

const SIGNATORY = { name: 'Divya Mohan', role: 'Founder · dmj.one', phone: '+91 79799 30293' };

/** A `kind:'letter'` record built inline (so SAMPLE_RECORD stays untouched). */
function letterRecord(contentOverrides: Partial<LetterContent> = {}): CredentialRecord {
  const content: LetterContent = {
    documentId: 'DMJ-LTR-20260604-01',
    issueDate: '2026-06-04',
    reference: 'DMJ/2026/0042',
    recipientLines: ['The Principal', 'Hindu College', 'University of Delhi'],
    subject: 'Confirmation of Internship Completion',
    salutation: 'Dear Sir/Madam,',
    bodyParagraphs: ['Body of the letter.'],
    valediction: 'Sincerely,',
    signatory: SIGNATORY,
    ...contentOverrides,
  };
  return { ...SAMPLE_RECORD, id: content.documentId, kind: 'letter', content };
}

/** A `kind:'upload'` record built inline. */
function uploadRecord(contentOverrides: Partial<UploadAttestation> = {}): CredentialRecord {
  const content: UploadAttestation = {
    documentId: 'DMJ-DOC-20260604-01',
    issueDate: '2026-06-04',
    originalFilename: 'offer-letter.pdf',
    originalSha256: 'e'.repeat(64),
    pageCount: 3,
    signatory: SIGNATORY,
    ...contentOverrides,
  };
  return { ...SAMPLE_RECORD, id: content.documentId, kind: 'upload', content };
}

describe('buildSection63Html', () => {
  const html = buildSection63Html(SAMPLE_RECORD, SAMPLE_SECTION63);

  it('produces a complete HTML document with no leftover placeholders', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
    expect(html).not.toContain('[');
  });

  it('frames the document as a BSA 2023 §63 Certificate of Authenticity', () => {
    expect(html).toContain('Bharatiya Sakshya Adhiniyam, 2023');
    expect(html).toContain('Section 63');
    expect(html).toContain('Certificate of Authenticity');
  });

  it('identifies the electronic record (id, recipient, type, issue date)', () => {
    expect(html).toContain('DMJ-IC-20260604-01');
    expect(html).toContain('Rijul Chaudhary');
    expect(html).toContain('Internship Certificate'); // human label for type
    expect(html).toContain('04 June 2026');
  });

  it('states the hash value and algorithm', () => {
    expect(html).toContain(SAMPLE_SECTION63.hashValue);
    expect(html).toContain('SHA-256');
  });

  it('states the manner of production and device particulars', () => {
    expect(html).toContain(SAMPLE_SECTION63.producedBy);
    expect(html).toContain(SAMPLE_SECTION63.productionMethod);
    expect(html).toContain(SAMPLE_SECTION63.deviceParticulars);
  });

  it('includes a pre-filled Part-A operator statement and a Part-B block', () => {
    expect(html).toContain('Part A');
    expect(html).toContain('operating the computer'.toLowerCase().slice(0, 6)); // "operat"
    expect(html).toContain('in the ordinary course');
    expect(html).toContain('Part B');
  });

  it('carries the issuer trust identity', () => {
    expect(html).toContain('dmj.one Trust Services');
    expect(html).toContain('Document Signing');
    expect(html).toContain('ML-DSA-87');
  });

  it('makes the honest disclosure (not a licensed-CA DSC; self-signed; tamper-evident)', () => {
    expect(html).toContain('independent educational initiative');
    expect(html).toContain('self-signed');
    expect(html).toContain('Certifying Authority');
    expect(html).toContain('Information Technology Act, 2000');
  });

  it('uses the brand fonts (embedded, no Google Fonts) and renders the operator name', () => {
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).toContain('data:font/woff2;base64,');
    expect(html).toContain(SAMPLE_CONTENT.signatory.name);
  });

  it('escapes hostile content in the recipient name', () => {
    const hostile = {
      ...SAMPLE_RECORD,
      content: { ...SAMPLE_CONTENT, recipientName: 'X & <script>bad</script>' },
    };
    const out = buildSection63Html(hostile, SAMPLE_SECTION63);
    expect(out).not.toContain('<script>bad</script>');
    expect(out).toContain('&lt;script&gt;');
  });
});

describe('createSection63Generator.metadata', () => {
  it('produces metadata with the given hash and the honest production particulars', () => {
    const gen = createSection63Generator({
      htmlToPdf: async () => new Uint8Array(),
      now: () => '2026-06-04T00:00:00.000Z',
    });
    const pdfSha256 = 'f'.repeat(64);
    const meta = gen.metadata(SAMPLE_CONTENT, pdfSha256);

    expect(meta.hashValue).toBe(pdfSha256);
    expect(meta.hashAlgorithm).toBe('SHA-256');
    expect(meta.producedBy).toContain('Cloud Run');
    expect(meta.producedBy).toContain('asia-east1');
    expect(meta.productionMethod).toContain('PAdES');
    expect(meta.productionMethod).toContain('ML-DSA-87');
    expect(meta.deviceParticulars).toContain('Chromium');
    expect(meta.generatedAt).toBe('2026-06-04T00:00:00.000Z');
  });

  it('generate() routes the built HTML through the injected htmlToPdf (no Chromium)', async () => {
    let receivedHtml = '';
    const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    const gen = createSection63Generator({
      htmlToPdf: async (h: string) => {
        receivedHtml = h;
        return fakePdf;
      },
    });
    const out = await gen.generate(SAMPLE_RECORD);
    expect(out).toBe(fakePdf);
    expect(receivedHtml).toContain('Certificate of Authenticity');
    expect(receivedHtml).toContain('DMJ-IC-20260604-01');
  });
});

describe('buildSection63Html — letter (Mode 2)', () => {
  const html = buildSection63Html(letterRecord(), SAMPLE_SECTION63);

  it('keeps the §63 legal structure (act, parts, disclosure) for a letter', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('Bharatiya Sakshya Adhiniyam, 2023');
    expect(html).toContain('Certificate of Authenticity');
    expect(html).toContain('Part A');
    expect(html).toContain('Part B');
    expect(html).toContain('self-signed'); // honest disclosure intact
    expect(html).toContain('Information Technology Act, 2000');
  });

  it('identifies the letter (document id, nature, subject, recipient, date)', () => {
    expect(html).toContain('DMJ-LTR-20260604-01');
    expect(html).toContain('Letterhead letter');
    expect(html).toContain('Confirmation of Internship Completion'); // subject
    expect(html).toContain('The Principal'); // first recipient line
    expect(html).toContain('04 June 2026');
    expect(html).toContain(SIGNATORY.name);
  });

  it('escapes a hostile subject in a letter §63', () => {
    const out = buildSection63Html(
      letterRecord({ subject: 'Bad <script>alert(1)</script> & "x"' }),
      SAMPLE_SECTION63,
    );
    expect(out).not.toContain('<script>alert(1)</script>');
    expect(out).toContain('&lt;script&gt;');
  });
});

describe('buildSection63Html — upload (Mode 3)', () => {
  const html = buildSection63Html(uploadRecord(), SAMPLE_SECTION63);

  it('keeps the §63 legal structure (act, parts, disclosure) for an upload', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('Bharatiya Sakshya Adhiniyam, 2023');
    expect(html).toContain('Certificate of Authenticity');
    expect(html).toContain('Part A');
    expect(html).toContain('Part B');
    expect(html).toContain('self-signed');
    expect(html).toContain('Certifying Authority');
  });

  it('identifies the uploaded document (id, nature, filename, ORIGINAL SHA-256, pages)', () => {
    expect(html).toContain('DMJ-DOC-20260604-01');
    expect(html).toContain('Uploaded document (attested)');
    expect(html).toContain('offer-letter.pdf');
    expect(html).toContain('e'.repeat(64)); // original SHA-256 (uploaded bytes)
    expect(html).toContain('Original SHA-256'); // the label
    expect(html).toContain(SIGNATORY.name);
  });

  it('discloses that the uploaded content is the uploader\'s (honest copy)', () => {
    expect(html).toContain('content is the uploader');
  });

  it('escapes a hostile filename in an upload §63', () => {
    const out = buildSection63Html(
      uploadRecord({ originalFilename: 'evil <img src=x onerror=alert(1)> & "x".pdf' }),
      SAMPLE_SECTION63,
    );
    expect(out).not.toContain('<img src=x onerror=alert(1)>');
    expect(out).toContain('&lt;img');
  });
});
