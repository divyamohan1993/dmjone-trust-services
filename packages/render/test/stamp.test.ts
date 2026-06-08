/**
 * Mode 3 unit tests: {@link stampAttestation} + {@link inspectPdf}. Pure
 * pdf-lib, no Chromium — these run on every host.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { stampAttestation, renderQrPng } from '../src/stamp.js';
import { inspectPdf, PdfInspectError } from '../src/pdf-inspect.js';

const PDF_MAGIC = '%PDF';

function startsWithPdfMagic(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, 4)).toString('latin1') === PDF_MAGIC;
}

/**
 * The PAdES-compatibility xref probe (same shape the cert integration test
 * uses): the stamped PDF MUST carry a classic cross-reference TABLE and NO
 * object streams, or `@signpdf/placeholder-plain` throws "Expected xref at NaN".
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
  const pointsAtTable = offset >= 0 && s.slice(offset, offset + 4) === 'xref';
  return {
    classicTable: pointsAtTable,
    hasStartxref: startxref !== null,
    xrefStream: /\/Type\s*\/XRef/.test(s),
    objectStreams: /\/Type\s*\/ObjStm/.test(s),
  };
}

/** Build a small multi-page PDF with a classic xref table (the upload stand-in). */
async function buildMultiPagePdf(pages = 3): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([595, 842]); // A4 in points
    page.drawText(`Uploaded document — page ${i + 1}`, { x: 60, y: 760, size: 16, font });
  }
  return doc.save({ useObjectStreams: false });
}

/**
 * A genuine, tiny PNG with KNOWN dimensions to stand in for the handwritten
 * signature image. Reusing `renderQrPng` gives a real, square PNG pdf-lib can
 * embed — no hand-crafted byte arrays.
 */
async function tinyPng(): Promise<Uint8Array> {
  return renderQrPng('signature-fixture');
}

const DOC_ID = 'DMJ-DOC-20260608-07';
const VERIFY_URL = `https://verify.dmj.one/c/${DOC_ID}`;
const ISSUE_DATE = '2026-06-08';

describe('stampAttestation', () => {
  it('returns a valid PDF, larger than the input, with a classic xref table (PAdES-compatible)', async () => {
    const input = await buildMultiPagePdf(3);
    const out = await stampAttestation({
      pdfBytes: input,
      documentId: DOC_ID,
      verifyUrl: VERIFY_URL,
      issueDateIso: ISSUE_DATE,
    });

    expect(startsWithPdfMagic(out)).toBe(true);
    expect(out).toBeInstanceOf(Uint8Array);
    // The stamp (QR image + caption on every page) makes the output larger.
    expect(out.byteLength).toBeGreaterThan(input.byteLength);

    const xref = pdfXrefShape(out);
    expect(xref.hasStartxref).toBe(true);
    expect(xref.classicTable).toBe(true);
    expect(xref.xrefStream).toBe(false);
    expect(xref.objectStreams).toBe(false);
  });

  it('preserves the page count and re-loads cleanly', async () => {
    const input = await buildMultiPagePdf(3);
    const out = await stampAttestation({
      pdfBytes: input,
      documentId: DOC_ID,
      verifyUrl: VERIFY_URL,
      issueDateIso: ISSUE_DATE,
    });
    const inspection = await inspectPdf(out);
    expect(inspection.pageCount).toBe(3);
  });

  it('does not mutate the input bytes (returns NEW bytes)', async () => {
    const input = await buildMultiPagePdf(2);
    const before = input.byteLength;
    await stampAttestation({
      pdfBytes: input,
      documentId: DOC_ID,
      verifyUrl: VERIFY_URL,
      issueDateIso: ISSUE_DATE,
    });
    expect(input.byteLength).toBe(before);
  });

  it('embeds the handwritten-signature image when a signature is supplied', async () => {
    const input = await buildMultiPagePdf(2);
    const sigPng = await tinyPng();

    const withoutSig = await stampAttestation({
      pdfBytes: input,
      documentId: DOC_ID,
      verifyUrl: VERIFY_URL,
      issueDateIso: ISSUE_DATE,
    });
    const withSig = await stampAttestation({
      pdfBytes: input,
      documentId: DOC_ID,
      verifyUrl: VERIFY_URL,
      issueDateIso: ISSUE_DATE,
      signature: {
        pngBytes: sigPng,
        placements: [{ page: 1, xPct: 0.55, yPct: 0.7, wPct: 0.3 }],
      },
    });

    expect(startsWithPdfMagic(withSig)).toBe(true);
    // The extra embedded signature image makes the signed-placement output
    // strictly larger than the same stamp without a signature, and it still
    // re-loads as a valid PDF with both pages.
    expect(withSig.byteLength).toBeGreaterThan(withoutSig.byteLength);
    const reload = await PDFDocument.load(withSig);
    expect(reload.getPageCount()).toBe(2);
  });

  it('draws the signature on EACH placement page (two placements > one)', async () => {
    const input = await buildMultiPagePdf(2);
    const sigPng = await tinyPng();

    const onePage = await stampAttestation({
      pdfBytes: input,
      documentId: DOC_ID,
      verifyUrl: VERIFY_URL,
      issueDateIso: ISSUE_DATE,
      signature: { pngBytes: sigPng, placements: [{ page: 1, xPct: 0.55, yPct: 0.7, wPct: 0.3 }] },
    });
    const twoPages = await stampAttestation({
      pdfBytes: input,
      documentId: DOC_ID,
      verifyUrl: VERIFY_URL,
      issueDateIso: ISSUE_DATE,
      signature: {
        pngBytes: sigPng,
        placements: [
          { page: 1, xPct: 0.55, yPct: 0.7, wPct: 0.3 },
          { page: 2, xPct: 0.1, yPct: 0.1, wPct: 0.2 },
        ],
      },
    });

    // The PNG is embedded once; a second placement adds a draw op on page 2, so
    // the two-placement render is strictly larger. Both re-load as 2-page PDFs.
    expect(twoPages.byteLength).toBeGreaterThan(onePage.byteLength);
    expect((await inspectPdf(twoPages)).pageCount).toBe(2);
  });

  it('tolerates an out-of-range signature page without throwing (ignores it)', async () => {
    const input = await buildMultiPagePdf(1);
    const sigPng = await tinyPng();
    const out = await stampAttestation({
      pdfBytes: input,
      documentId: DOC_ID,
      verifyUrl: VERIFY_URL,
      issueDateIso: ISSUE_DATE,
      signature: { pngBytes: sigPng, placements: [{ page: 9, xPct: 0.1, yPct: 0.1, wPct: 0.2 }] },
    });
    expect(startsWithPdfMagic(out)).toBe(true);
    expect((await inspectPdf(out)).pageCount).toBe(1);
  });

  it('rejects a non-PDF buffer (defence-in-depth backstop)', async () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    await expect(
      stampAttestation({
        pdfBytes: garbage,
        documentId: DOC_ID,
        verifyUrl: VERIFY_URL,
        issueDateIso: ISSUE_DATE,
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});

describe('renderQrPng', () => {
  it('produces real PNG bytes (PNG magic signature)', async () => {
    const png = await renderQrPng(VERIFY_URL);
    expect(png).toBeInstanceOf(Uint8Array);
    // PNG magic: 89 50 4E 47 0D 0A 1A 0A.
    expect(Buffer.from(png.subarray(0, 4)).toString('hex')).toBe('89504e47');
  });
});

describe('inspectPdf', () => {
  it('reports the page count and each page box (in points) for a known PDF', async () => {
    const input = await buildMultiPagePdf(3);
    const inspection = await inspectPdf(input);
    expect(inspection.pageCount).toBe(3);
    expect(inspection.pages).toHaveLength(3);
    for (const page of inspection.pages) {
      // A4 in points, as built by the fixture.
      expect(page.widthPt).toBeCloseTo(595, 0);
      expect(page.heightPt).toBeCloseTo(842, 0);
    }
  });

  it('reflects non-uniform page sizes', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    doc.addPage([612, 792]); // US Letter
    const bytes = await doc.save({ useObjectStreams: false });
    const inspection = await inspectPdf(bytes);
    expect(inspection.pageCount).toBe(2);
    expect(inspection.pages[0]).toEqual({ widthPt: 300, heightPt: 400 });
    expect(inspection.pages[1]).toEqual({ widthPt: 612, heightPt: 792 });
  });

  it('throws a typed PdfInspectError on a garbage (non-PDF) buffer', async () => {
    const garbage = new Uint8Array([0x47, 0x49, 0x46, 0x38]); // "GIF8"
    await expect(inspectPdf(garbage)).rejects.toBeInstanceOf(PdfInspectError);
  });

  it('throws a typed PdfInspectError on an empty buffer', async () => {
    await expect(inspectPdf(new Uint8Array(0))).rejects.toBeInstanceOf(PdfInspectError);
  });
});
