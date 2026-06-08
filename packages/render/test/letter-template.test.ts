import { describe, it, expect } from 'vitest';
import type { LetterContent } from '@dmjone/shared';
import { buildLetterHtml } from '../src/letter-template.js';

const QR_DATA_URI = 'data:image/png;base64,QR_PLACEHOLDER_BYTES';

const SAMPLE_LETTER: LetterContent = {
  documentId: 'DMJ-LTR-20260608-01',
  issueDate: '2026-06-08',
  reference: 'DMJ/2026/EDU/014',
  recipientLines: ['The Principal', 'Springfield High School', 'New Delhi 110001'],
  subject: 'Invitation to the dmj.one Open Learning Programme',
  salutation: 'Dear Sir/Madam,',
  bodyParagraphs: [
    'It is our pleasure to invite your institution to participate in the dmj.one Open Learning Programme, an initiative dedicated to making high-quality, accessible education available to every learner.',
    '[[align:center]]We believe this collaboration will be **mutually rewarding**.',
  ],
  valediction: 'Sincerely,',
  signatory: {
    name: 'Divya Mohan',
    role: 'Founder · dmj.one',
    phone: '+91 79799 30293',
  },
};

function build(content: LetterContent = SAMPLE_LETTER): string {
  return buildLetterHtml({ content, qrDataUri: QR_DATA_URI });
}

/** A hostile-input variant: every escapable character in user-controlled fields. */
const XSS_LETTER: LetterContent = {
  ...SAMPLE_LETTER,
  reference: 'Ref & <b>x</b>',
  recipientLines: ['A & B <script>alert(1)</script>', '"Q" \'R\' <img src=x onerror=1>'],
  subject: 'Subject <b>bold</b> & "more"',
  salutation: 'Dear & <i>Sir</i>,',
  bodyParagraphs: ['Body & <strong>danger</strong> <img src=x onerror=1>'],
  valediction: 'Yours & <u>truly</u>,',
  signatory: { name: 'Sig & <b>Name</b>', role: 'Role & <i>R</i>', phone: '+91 <00000>' },
};

describe('buildLetterHtml', () => {
  const html = build();

  it('produces a complete HTML document', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('is a FLOWING document: @page A4 margins, no absolute frame, break-inside on the sig block', () => {
    expect(html).toContain('@page{ size:A4;');
    // No absolutely-framed cert chrome (this is a flowing letter, not the cert).
    expect(html).not.toContain('class="frame"');
    expect(html).not.toContain('class="corner');
    expect(html).not.toContain('position:absolute');
    // The signature block must stay whole across a page boundary.
    expect(html).toContain('.sigblock{ margin-top:9mm; break-inside:avoid; }');
  });

  it('injects every letter field per §B.1', () => {
    expect(html).toContain('DMJ-LTR-20260608-01');
    expect(html).toContain('08 June 2026'); // formatted issueDate
    expect(html).toContain('DMJ/2026/EDU/014'); // reference
    // Recipient lines, each on its own line.
    expect(html).toContain('>The Principal<');
    expect(html).toContain('>Springfield High School<');
    expect(html).toContain('>New Delhi 110001<');
    // Subject + salutation + valediction.
    expect(html).toContain('Invitation to the dmj.one Open Learning Programme');
    expect(html).toContain('Dear Sir/Madam,');
    expect(html).toContain('Sincerely,');
  });

  it('renders the optional Subject line in bold (its own bold element)', () => {
    expect(html).toContain('.subject{ font-family:var(--serif); font-weight:600;');
    expect(html).toContain('class="subject">Subject:');
  });

  it('fills the For-dmj.one signature block from content.signatory', () => {
    expect(html).toContain('For dmj.one');
    expect(html).toContain('Divya Mohan');
    expect(html).toContain('Founder · dmj.one');
    expect(html).toContain('+91 79799 30293');
    expect(html).toContain('class="sig-img"');
  });

  it('embeds the footer verify line + QR card with the supplied data-URI', () => {
    expect(html).toContain(QR_DATA_URI);
    expect(html).toContain('verify.dmj.one');
    expect(html).toContain('Document ID: DMJ-LTR-20260608-01');
  });

  it('embeds all four font families as base64 woff2 @font-face data-URIs (no Google Fonts)', () => {
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');
    expect(html).toContain('@font-face');
    expect(html).toContain('data:font/woff2;base64,');
    for (const family of ['EB Garamond', 'Playfair Display', 'Marcellus']) {
      expect(html).toContain(`font-family:"${family}"`);
    }
  });

  it('inlines the brand logo + signature images as base64 data-URIs', () => {
    // logo + the (now transparent) signature are inlined as PNG data-URIs.
    expect((html.match(/data:image\/png;base64,/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain('data:image/jpeg');
    expect(html).toContain('class="logo"');
  });

  it('leaves no template placeholder tokens (base64 carries no "[")', () => {
    // The fixture body uses a [[align:…]] directive that the compiler strips, so
    // assert specifically that no leftover directive token survives.
    expect(html).not.toContain('[[align:');
  });

  describe('rich body via compileParagraph', () => {
    it('wraps body paragraphs in <p> with pa-* classes and compiles inline marks', () => {
      // Default (pref-less) paragraph → pa-justify; the directed one → pa-center.
      expect(html).toContain('<p class="pa-justify">');
      expect(html).toContain('<p class="pa-center">');
      // **mutually rewarding** compiles to <strong>.
      expect(html).toContain('<strong>mutually rewarding</strong>');
      // Raw markers and the directive token never reach the output.
      expect(html).not.toContain('**');
      expect(html).not.toContain('[[align:center]]');
    });

    it('defines the four pa-* alignment rules (CSP-safe, class-based)', () => {
      expect(html).toContain('.body p.pa-left{ text-align:left; }');
      expect(html).toContain('.body p.pa-center{ text-align:center; }');
      expect(html).toContain('.body p.pa-right{ text-align:right; }');
      expect(html).toContain('.body p.pa-justify{ text-align:justify; text-justify:inter-word; }');
    });
  });

  describe('optional fields are omitted when absent', () => {
    it('drops the reference, subject, salutation, and valediction elements when not provided', () => {
      const bare: LetterContent = {
        documentId: 'DMJ-LTR-20260608-02',
        issueDate: '2026-06-08',
        recipientLines: [],
        bodyParagraphs: ['A minimal letter with only a body.'],
        signatory: SAMPLE_LETTER.signatory,
      };
      const out = build(bare);
      expect(out).not.toContain('class="subject"');
      expect(out).not.toContain('class="salutation"');
      expect(out).not.toContain('class="valediction"');
      expect(out).not.toContain('Ref:');
      // Date of issue is always shown.
      expect(out).toContain('Date of Issue:');
    });
  });

  describe('HTML escaping of hostile input', () => {
    const xss = build(XSS_LETTER);

    it('escapes injected markup so no raw script/img tag survives', () => {
      expect(xss).not.toContain('<script>alert(1)</script>');
      expect(xss).not.toContain('<img src=x onerror=1>');
      expect(xss).toContain('&lt;script&gt;');
    });

    it('escapes ampersands and quotes across every interpolated field', () => {
      expect(xss).toContain('A &amp; B');
      expect(xss).toContain('&quot;Q&quot;');
      // Reference, subject, salutation, valediction, signatory all escaped.
      expect(xss).toContain('Ref &amp;');
      expect(xss).toContain('Subject &lt;b&gt;bold&lt;/b&gt;');
      expect(xss).toContain('Sig &amp; &lt;b&gt;Name&lt;/b&gt;');
    });

    it('keeps the structural QR image intact even with hostile content', () => {
      expect(xss).toContain(QR_DATA_URI);
    });

    it('keeps body bold markup safe — injected markup inside ** stays escaped', () => {
      const evil: LetterContent = {
        ...SAMPLE_LETTER,
        bodyParagraphs: ['**<script>alert(1)</script>**'],
      };
      const out = build(evil);
      expect(out).toContain('<strong>');
      expect(out).not.toContain('<script>alert(1)</script>');
      expect(out).toContain('&lt;script&gt;');
    });
  });
});
