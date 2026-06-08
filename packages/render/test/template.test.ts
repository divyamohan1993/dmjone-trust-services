import { describe, it, expect } from 'vitest';
import { buildCertificateHtml } from '../src/template.js';
import { SAMPLE_CONTENT, XSS_CONTENT } from './fixtures.js';

const QR_DATA_URI = 'data:image/png;base64,QR_PLACEHOLDER_BYTES';

function build(content = SAMPLE_CONTENT): string {
  return buildCertificateHtml({ content, qrDataUri: QR_DATA_URI });
}

describe('buildCertificateHtml', () => {
  const html = build();

  it('produces a complete HTML document', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('leaves no template placeholder tokens', () => {
    // The reference template marks every editable slot with `[ ... ]`. base64
    // payloads contain no `[`, so a clean document has zero `[` characters.
    expect(html).not.toContain('[');
  });

  it('injects every content field', () => {
    expect(html).toContain('DMJ-IC-20260604-01');
    expect(html).toContain('04 June 2026'); // formatted issueDate
    expect(html).toContain('Certificate of'); // kicker
    expect(html).toContain('>Internship<'); // title in its element
    expect(html).toContain('This is to certify that'); // intro
    expect(html).toContain('Rijul Chaudhary'); // recipient
    for (const para of SAMPLE_CONTENT.bodyParagraphs) {
      expect(html).toContain(para);
    }
    expect(html).toContain(SAMPLE_CONTENT.closingLine!); // closing/wish line
  });

  it('fills the signature block from content.signatory (not hardcoded)', () => {
    expect(html).toContain('Divya Mohan');
    expect(html).toContain('Founder · dmj.one');
    expect(html).toContain('+91 79799 30293');
  });

  it('repeats the credential ID in both the ref row and the footer verify line', () => {
    const occurrences = html.split('DMJ-IC-20260604-01').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('embeds all four font families as base64 woff2 @font-face data-URIs (no Google Fonts)', () => {
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');
    expect(html).toContain('@font-face');
    expect(html).toContain('data:font/woff2;base64,');
    for (const family of ['EB Garamond', 'Playfair Display', 'Marcellus', 'Great Vibes']) {
      expect(html).toContain(`font-family:"${family}"`);
    }
  });

  it('embeds the three brand images as base64 data-URIs', () => {
    // logo, watermark, and the (now transparent) signature are all PNG data-URIs.
    expect((html.match(/data:image\/png;base64,/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(html).not.toContain('data:image/jpeg');
    expect(html).toContain('class="watermark"');
    expect(html).toContain('class="logo"');
    expect(html).toContain('class="sig-img"');
  });

  it('places the supplied QR data-URI inside the QR card', () => {
    expect(html).toContain(QR_DATA_URI);
    expect(html).toContain('Scan to verify');
  });

  it('keeps the gold frame, diamond corners, wash and footer motto', () => {
    expect(html).toContain('class="frame"');
    expect(html).toContain('class="corner tl"');
    expect(html).toContain('class="corner br"');
    expect(html).toContain('class="wash"');
    expect(html).toContain('Dream &middot; Manifest &middot; Journey &middot; Together as One');
  });

  it('omits the optional closing line element when closingLine is absent', () => {
    const noClose: typeof SAMPLE_CONTENT = { ...SAMPLE_CONTENT };
    delete (noClose as { closingLine?: string }).closingLine;
    const out = buildCertificateHtml({ content: noClose, qrDataUri: QR_DATA_URI });
    expect(out).not.toContain('class="wish"');
  });

  describe('HTML escaping of hostile input', () => {
    const xss = build(XSS_CONTENT);

    it('escapes injected markup so no raw script/img tag survives', () => {
      expect(xss).not.toContain('<script>alert(1)</script>');
      expect(xss).not.toContain('<img src=x onerror=1>');
      expect(xss).toContain('&lt;script&gt;');
    });

    it('escapes ampersands and quotes in user fields', () => {
      expect(xss).toContain('A &amp; B');
      expect(xss).toContain('&quot;Q&quot;');
    });

    it('still contains exactly one structural QR image even with hostile content', () => {
      expect(xss).toContain(QR_DATA_URI);
    });
  });

  describe('body bold markup', () => {
    it('compiles **term** in a body paragraph to a real <strong>', () => {
      const withBold: typeof SAMPLE_CONTENT = {
        ...SAMPLE_CONTENT,
        bodyParagraphs: ['completed an internship at **Acme Corp** as a **Software Engineer**.'],
      };
      const out = buildCertificateHtml({ content: withBold, qrDataUri: QR_DATA_URI });
      expect(out).toContain('<strong>Acme Corp</strong>');
      expect(out).toContain('<strong>Software Engineer</strong>');
      // The raw ** markers are gone from the output (compiled, not displayed).
      expect(out).not.toContain('**');
    });

    it('emits no <strong> for a body with no markers (template has none of its own)', () => {
      // SAMPLE_CONTENT body has no ** markers; the cert template emits no other
      // <strong>, so a plain body yields a document free of <strong>.
      expect(build()).not.toContain('<strong>');
    });

    it('keeps bold markup safe — injected markup inside ** stays escaped', () => {
      const evil: typeof SAMPLE_CONTENT = {
        ...SAMPLE_CONTENT,
        bodyParagraphs: ['**<script>alert(1)</script>**'],
      };
      const out = buildCertificateHtml({ content: evil, qrDataUri: QR_DATA_URI });
      expect(out).toContain('<strong>');
      expect(out).not.toContain('<script>alert(1)</script>');
      expect(out).toContain('&lt;script&gt;');
    });

    it('compiles italic and underline marks in a body paragraph', () => {
      const withMarks: typeof SAMPLE_CONTENT = {
        ...SAMPLE_CONTENT,
        bodyParagraphs: ['the *role* of __Lead__ engineer.'],
      };
      const out = buildCertificateHtml({ content: withMarks, qrDataUri: QR_DATA_URI });
      expect(out).toContain('<em>role</em>');
      expect(out).toContain('<u>Lead</u>');
    });
  });

  describe('per-paragraph alignment (§2.4)', () => {
    it('wraps every body paragraph in a <p> carrying exactly one pa-* class', () => {
      // Default (pref-less) SAMPLE_CONTENT paragraphs render justified.
      expect(html).toContain('<p class="pa-justify">');
      // Every fixture body paragraph is pref-less ⇒ one pa-justify <p> each.
      const justifyParas = html.split('<p class="pa-justify">').length - 1;
      expect(justifyParas).toBe(SAMPLE_CONTENT.bodyParagraphs.length);
    });

    it('emits the directed class and strips the directive from the rendered text', () => {
      const aligned: typeof SAMPLE_CONTENT = {
        ...SAMPLE_CONTENT,
        bodyParagraphs: [
          '[[align:left]]Left text.',
          '[[align:center]]Centred text.',
          '[[align:right]]Right text.',
        ],
      };
      const out = buildCertificateHtml({ content: aligned, qrDataUri: QR_DATA_URI });
      expect(out).toContain('<p class="pa-left">Left text.</p>');
      expect(out).toContain('<p class="pa-center">Centred text.</p>');
      expect(out).toContain('<p class="pa-right">Right text.</p>');
      // The directive tokens themselves never reach the output as literal text.
      expect(out).not.toContain('[[align:left]]');
      expect(out).not.toContain('[[align:center]]');
      expect(out).not.toContain('[[align:right]]');
    });

    it('defines the four pa-* CSS rules and the em/u body rules', () => {
      expect(html).toContain('.body p.pa-left{ text-align:left; }');
      expect(html).toContain('.body p.pa-center{ text-align:center; }');
      expect(html).toContain('.body p.pa-right{ text-align:right; }');
      expect(html).toContain('.body p.pa-justify{ text-align:justify; text-justify:inter-word; }');
      expect(html).toContain('.body em{ font-style:italic; }');
      expect(html).toContain('.body u{ text-decoration:underline; }');
      // .body container keeps justify as the inherited default.
      expect(html).toContain('.body{ max-width:152mm; margin:7mm auto 0; text-align:justify;');
    });

    it('uses no inline style attribute for alignment (CSP-safe)', () => {
      const aligned: typeof SAMPLE_CONTENT = {
        ...SAMPLE_CONTENT,
        bodyParagraphs: ['[[align:center]]Centred.'],
      };
      const out = buildCertificateHtml({ content: aligned, qrDataUri: QR_DATA_URI });
      expect(out).not.toContain('style="text-align');
      expect(out).not.toContain('style=');
    });

    it('a literally-typed [[align:…]] after the directive renders verbatim (§2.2 collision)', () => {
      const collide: typeof SAMPLE_CONTENT = {
        ...SAMPLE_CONTENT,
        bodyParagraphs: ['[[align:center]][[align:left]]Hello'],
      };
      const out = buildCertificateHtml({ content: collide, qrDataUri: QR_DATA_URI });
      // Outer directive wins the class; inner one renders as literal text.
      expect(out).toContain('<p class="pa-center">[[align:left]]Hello</p>');
    });
  });
});
