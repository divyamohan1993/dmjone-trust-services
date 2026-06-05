import { describe, it, expect } from 'vitest';
import { createCertificateRenderer } from '../src/renderer.js';
import { SAMPLE_CONTENT } from './fixtures.js';

describe('createCertificateRenderer (DI, no Chromium)', () => {
  it('generates a QR for qrUrl, builds the certificate HTML, and routes it through htmlToPdf', async () => {
    let receivedHtml = '';
    const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    const renderer = createCertificateRenderer({
      htmlToPdf: async (html: string) => {
        receivedHtml = html;
        return fakePdf;
      },
    });

    const out = await renderer.render(SAMPLE_CONTENT, {
      qrUrl: 'https://verify.dmj.one/c/DMJ-IC-20260604-01',
    });

    expect(out).toBe(fakePdf);
    // The QR is rendered to a PNG data-URI and embedded in the card.
    expect(receivedHtml).toContain('data:image/png;base64,');
    expect(receivedHtml).toContain('Scan to verify');
    // Content made it into the document.
    expect(receivedHtml).toContain('Rijul Chaudhary');
    expect(receivedHtml).toContain('DMJ-IC-20260604-01');
    // No leftover placeholders.
    expect(receivedHtml).not.toContain('[');
  });
});
