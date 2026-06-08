/**
 * Integration test: actually launch Chromium and produce real PDFs.
 *
 * Guarded so the suite stays green on a host without a usable browser. Rather
 * than trust puppeteer's (in some pnpm layouts unreliable) executablePath()
 * resolver, the guard performs one real trial launch through the same code path
 * the renderer uses and skips if it cannot produce a PDF. So: on CI (browser
 * provisioned) it runs; on a bare host it skips cleanly.
 */

import { describe, it, expect } from 'vitest';
import { createChromiumRenderer } from '../src/chromium.js';
import { createCertificateRenderer } from '../src/renderer.js';
import { createSection63Generator } from '../src/section63.js';
import { SAMPLE_CONTENT, SAMPLE_RECORD } from './fixtures.js';

const PDF_MAGIC = '%PDF';

function startsWithPdfMagic(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, 4)).toString('latin1') === PDF_MAGIC;
}

/**
 * Page count of a PDF, read from the page-tree `/Count` in the (uncompressed)
 * Chromium output. Authoritative for print pagination — DOM measurement is not,
 * because it does not model CSS page breaks. Falls back to counting `/Type/Page`
 * objects if no `/Count` is found.
 */
function pdfPageCount(bytes: Uint8Array): number {
  const s = Buffer.from(bytes).toString('latin1');
  const count = /\/Count\s+(\d+)/.exec(s);
  if (count?.[1]) return Number(count[1]);
  return (s.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

/**
 * The CERTIFICATE PDF must use a CLASSIC cross-reference table (`xref` +
 * `startxref`), NOT a cross-reference stream — the PAdES signer
 * (@signpdf/placeholder-plain, consumed by @dmjone/crypto at issue-time) throws
 * "Expected xref at NaN" on an xref-stream PDF. Raw Chromium `page.pdf()` output
 * is classic; the only thing that would regress this is post-processing the cert
 * through pdf-lib (load + default save → xref stream). This holds the contract.
 */
function pdfXrefShape(bytes: Uint8Array): {
  classicTable: boolean;
  hasStartxref: boolean;
  xrefStream: boolean;
  objectStreams: boolean;
} {
  const s = Buffer.from(bytes).toString('latin1');
  const startxref = /startxref\s+(\d+)/.exec(s);
  const offset = startxref?.[1] ? Number(startxref[1]) : -1;
  // The bytes that startxref points to must begin the literal `xref` keyword.
  const pointsAtTable = offset >= 0 && s.slice(offset, offset + 4) === 'xref';
  return {
    classicTable: pointsAtTable,
    hasStartxref: startxref !== null,
    xrefStream: /\/Type\s*\/XRef/.test(s),
    objectStreams: /\/Type\s*\/ObjStm/.test(s),
  };
}

/** One real trial launch + print; true only if Chromium actually works here. */
async function probeChromium(): Promise<boolean> {
  try {
    const htmlToPdf = createChromiumRenderer();
    const pdf = await htmlToPdf('<!DOCTYPE html><html><body><p>probe</p></body></html>');
    return startsWithPdfMagic(pdf);
  } catch {
    return false;
  }
}

const chromiumWorks = await probeChromium();

describe.skipIf(!chromiumWorks)('Chromium integration', () => {
  it(
    'render() returns a valid A4 PDF (> 20 KB) from real Chromium',
    async () => {
      const renderer = createCertificateRenderer();
      const pdf = await renderer.render(SAMPLE_CONTENT, {
        qrUrl: 'https://verify.dmj.one/c/DMJ-IC-20260604-01',
      });
      expect(startsWithPdfMagic(pdf)).toBe(true);
      // Inlined fonts + images make this comfortably large; 20 KB is a floor a
      // blank/failed render would fall below.
      expect(pdf.byteLength).toBeGreaterThan(20 * 1024);
      // The certificate has a fixed-height page; it must be exactly one A4 page.
      expect(pdfPageCount(pdf)).toBe(1);
    },
    120_000,
  );

  it(
    'render() output is PAdES-signer-compatible: classic xref table, no xref/object streams',
    async () => {
      // Contract with @dmjone/crypto's PAdES signer (@signpdf/placeholder-plain):
      // it requires a classic cross-reference table and throws "Expected xref at
      // NaN" on a cross-reference stream. This guards against anyone ever adding
      // a pdf-lib round-trip to the certificate path (default save → xref stream),
      // which would silently break issue-time signing.
      const renderer = createCertificateRenderer();
      const pdf = await renderer.render(SAMPLE_CONTENT, {
        qrUrl: 'https://verify.dmj.one/c/DMJ-IC-20260604-01',
      });
      const xref = pdfXrefShape(pdf);
      expect(xref.hasStartxref).toBe(true);
      expect(xref.classicTable).toBe(true);
      expect(xref.xrefStream).toBe(false);
      expect(xref.objectStreams).toBe(false);
    },
    120_000,
  );

  it(
    'section63 generate() returns a valid three-page PDF from real Chromium',
    async () => {
      const gen = createSection63Generator();
      const pdf = await gen.generate(SAMPLE_RECORD);
      expect(startsWithPdfMagic(pdf)).toBe(true);
      expect(pdf.byteLength).toBeGreaterThan(20 * 1024);
      // The §63 certificate is a deliberate, clean three-page legal instrument:
      // Parts 1-3, the Part A (operator) AND Part B (expert) statements required by
      // BSA §63(4), the issuer identity + honest disclosure, and the dual signature
      // row. A FOURTH page would mean a block (signature row / footer) was orphaned —
      // this assertion is the regression guard for that.
      expect(pdfPageCount(pdf)).toBe(3);
    },
    120_000,
  );
});
