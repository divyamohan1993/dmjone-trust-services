import { describe, it, expect } from 'vitest';
import { buildSection63Html } from '../src/section63-template.js';
import { createSection63Generator } from '../src/section63.js';
import { SAMPLE_RECORD, SAMPLE_SECTION63, SAMPLE_CONTENT } from './fixtures.js';

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
