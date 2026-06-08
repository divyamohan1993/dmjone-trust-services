/**
 * Inspect an uploaded PDF WITHOUT modifying it — page count and each page's
 * box in PDF points — for the Mode 3 placement UI. Pure pdf-lib; no Chromium,
 * no signing, no allocation. Side-effect-free.
 *
 * A non-PDF, encrypted, or corrupt file fails loudly with a typed
 * {@link PdfInspectError} the route maps to a uniform 400, so a hostile or
 * accidental upload never reaches the stamping / signing path.
 */

import { PDFDocument } from 'pdf-lib';

/** Result of {@link inspectPdf}: page count + each page's box in PDF points. */
export interface PdfInspection {
  pageCount: number;
  pages: Array<{ widthPt: number; heightPt: number }>;
}

/**
 * Thrown when a buffer cannot be inspected as an unencrypted PDF (not a PDF,
 * encrypted, or corrupt). A distinct class so the issuer route can `instanceof`
 * it and return a uniform 400 rather than leaking pdf-lib's internal errors.
 */
export class PdfInspectError extends Error {
  override readonly name = 'PdfInspectError';
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    // Restore the prototype chain across the ES5 target transpilation so
    // `instanceof PdfInspectError` holds for callers.
    Object.setPrototypeOf(this, PdfInspectError.prototype);
  }
}

/**
 * Load `pdfBytes` via pdf-lib (read-only) and report the page count + each
 * page's `{widthPt,heightPt}`. Encrypted PDFs are rejected (no
 * `ignoreEncryption`), as are non-PDF / corrupt buffers — all surface as a
 * {@link PdfInspectError}. The bytes are never modified or persisted.
 */
export async function inspectPdf(pdfBytes: Uint8Array): Promise<PdfInspection> {
  let pdf: PDFDocument;
  try {
    // Default load (NO `ignoreEncryption`): pdf-lib throws on an encrypted
    // document, so the encrypted case is rejected here BY CONSTRUCTION — there
    // is no separate code branch for it, hence no dedicated fixture test (and
    // pdf-lib cannot write an encrypted PDF to build one). Non-PDF and corrupt
    // buffers throw here too. All three surface as PdfInspectError.
    pdf = await PDFDocument.load(pdfBytes);
  } catch (cause) {
    throw new PdfInspectError('The file is not a readable, unencrypted PDF.', { cause });
  }

  const pages = pdf.getPages().map((page) => {
    const { width, height } = page.getSize();
    return { widthPt: width, heightPt: height };
  });

  return { pageCount: pages.length, pages };
}
