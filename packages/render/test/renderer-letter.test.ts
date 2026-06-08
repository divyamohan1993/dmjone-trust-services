import { describe, it, expect } from 'vitest';
import type { LetterContent } from '@dmjone/shared';
import { createCertificateRenderer } from '../src/renderer.js';

const SAMPLE_LETTER: LetterContent = {
  documentId: 'DMJ-LTR-20260608-01',
  issueDate: '2026-06-08',
  reference: 'DMJ/2026/EDU/014',
  recipientLines: ['The Principal', 'Springfield High School'],
  subject: 'Invitation to the dmj.one Open Learning Programme',
  salutation: 'Dear Sir/Madam,',
  bodyParagraphs: ['It is our pleasure to invite your institution to collaborate with dmj.one.'],
  valediction: 'Sincerely,',
  signatory: { name: 'Divya Mohan', role: 'Founder · dmj.one', phone: '+91 79799 30293' },
};

describe('createCertificateRenderer.renderLetter (DI, no Chromium)', () => {
  it('generates a QR for qrUrl, builds the letter HTML, and routes it through htmlToPdf', async () => {
    let receivedHtml = '';
    const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    const renderer = createCertificateRenderer({
      htmlToPdf: async (html: string) => {
        receivedHtml = html;
        return fakePdf;
      },
    });

    const out = await renderer.renderLetter(SAMPLE_LETTER, {
      qrUrl: 'https://verify.dmj.one/c/DMJ-LTR-20260608-01',
    });

    expect(out).toBe(fakePdf);
    // The QR is rendered to a PNG data-URI and embedded in the verify card.
    expect(receivedHtml).toContain('data:image/png;base64,');
    expect(receivedHtml).toContain('verify.dmj.one');
    // Letter content made it into the document.
    expect(receivedHtml).toContain('The Principal');
    expect(receivedHtml).toContain('DMJ-LTR-20260608-01');
    expect(receivedHtml).toContain('Invitation to the dmj.one Open Learning Programme');
    // It is the flowing letter, not the cert (no ornamental frame).
    expect(receivedHtml).not.toContain('class="frame"');
    // No leftover alignment directive token.
    expect(receivedHtml).not.toContain('[[align:');
  });

  it('render() (cert path) still works alongside renderLetter — signature intact', async () => {
    const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const renderer = createCertificateRenderer({ htmlToPdf: async () => fakePdf });
    // The widened renderer still exposes the frozen render() contract.
    expect(typeof renderer.render).toBe('function');
    expect(typeof renderer.renderLetter).toBe('function');
  });
});
