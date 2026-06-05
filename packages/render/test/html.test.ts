import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeHtmlWithEmphasis, formatIsoDate } from '../src/html.js';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml('A & B < C > D "E" \'F\'')).toBe(
      'A &amp; B &lt; C &gt; D &quot;E&quot; &#39;F&#39;',
    );
  });

  it('neutralises a script tag', () => {
    const out = escapeHtml('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Rijul Chaudhary')).toBe('Rijul Chaudhary');
  });
});

describe('escapeHtmlWithEmphasis', () => {
  it('compiles **word** to a real <strong> while keeping injected markup inert (the safety case)', () => {
    const out = escapeHtmlWithEmphasis('**<script>alert(1)</script>**');
    // The bold wrapper is a real tag…
    expect(out).toContain('<strong>');
    expect(out).toContain('</strong>');
    // …but the content inside it stayed escaped — no live script tag.
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toBe('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>');
  });

  it('does NOT treat a user-typed <strong> as markup — only ** mints tags', () => {
    const out = escapeHtmlWithEmphasis('plain <strong>x</strong> text');
    expect(out).not.toContain('<strong>');
    expect(out).toBe('plain &lt;strong&gt;x&lt;/strong&gt; text');
  });

  it('preserves escaped entities inside an emphasised run', () => {
    expect(escapeHtmlWithEmphasis('**Tom & Jerry**')).toBe('<strong>Tom &amp; Jerry</strong>');
  });

  it('converts multiple emphasised runs separately (no greedy over-match)', () => {
    const out = escapeHtmlWithEmphasis('hire **Acme** as **Engineer**');
    expect(out).toBe('hire <strong>Acme</strong> as <strong>Engineer</strong>');
    expect(out.match(/<strong>/g)).toHaveLength(2);
  });

  it('leaves a lone unmatched ** literal', () => {
    const out = escapeHtmlWithEmphasis('a **lonely marker');
    expect(out).not.toContain('<strong>');
    expect(out).toBe('a **lonely marker');
  });

  it('leaves text with no markers identical to plain escape', () => {
    const s = 'has completed the internship with dmj.one & peers';
    expect(escapeHtmlWithEmphasis(s)).toBe(escapeHtml(s));
  });
});

describe('formatIsoDate', () => {
  it('formats an ISO date as "DD Month YYYY" without timezone drift', () => {
    expect(formatIsoDate('2026-06-04')).toBe('04 June 2026');
    expect(formatIsoDate('2026-01-01')).toBe('01 January 2026');
    expect(formatIsoDate('2026-12-31')).toBe('31 December 2026');
  });

  it('accepts a full ISO timestamp and uses the date part', () => {
    expect(formatIsoDate('2026-06-04T10:15:00.000Z')).toBe('04 June 2026');
  });

  it('falls back to the raw value for an unparseable input', () => {
    expect(formatIsoDate('not-a-date')).toBe('not-a-date');
  });
});
