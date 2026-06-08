/**
 * Mode 3 — stamp an uploaded PDF with a visible validation mark (pure pdf-lib,
 * NO Chromium). Every page gets a compact validation stamp in the bottom margin
 * (a small QR encoding the verify URL + a one-line caption), sitting inside the
 * page's bottom margin so it never overlaps the document's own content. An
 * optional handwritten-signature PNG is embedded once and drawn on each of its
 * placement pages, every page at its own position and size.
 *
 * The output is saved with `useObjectStreams:false` so it carries a CLASSIC
 * cross-reference TABLE — the PAdES signer (`@signpdf/placeholder-plain`,
 * consumed by `@dmjone/crypto` at sign-time) throws "Expected xref at NaN" on a
 * cross-reference STREAM. (pdf-lib decodes any object streams in the input on
 * load and re-serializes a classic table on save, so the result is
 * PAdES-compatible regardless of how the uploaded PDF was originally written.)
 *
 * The ML-DSA / PAdES signing happens in @dmjone/crypto, NOT here: this package
 * only produces the visible, stamped bytes the signer then covers.
 */

import type { SignaturePlacement } from '@dmjone/shared';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import * as QRCode from 'qrcode';
import type { QRCodeToBufferOptions } from 'qrcode';

/** Inputs for {@link stampAttestation}. */
export interface StampInput {
  /** The uploaded PDF bytes to stamp. Never mutated; a NEW array is returned. */
  pdfBytes: Uint8Array;
  /** The visible validation id; also the QR target tail (e.g. `DMJ-DOC-…`). */
  documentId: string;
  /** Full https URL the QR encodes (e.g. `https://verify.dmj.one/c/<documentId>`). */
  verifyUrl: string;
  /** ISO-8601 `YYYY-MM-DD`; shown in the validation stamp caption on every page. */
  issueDateIso: string;
  /** Optional handwritten-signature stamp: a transparent PNG + one placement
   *  per page it is drawn on (each its own position and size). */
  signature?: { pngBytes: Uint8Array; placements: SignaturePlacement[] };
}

/** One PDF point per millimetre: 1 mm = 72/25.4 pt. */
const PT_PER_MM = 72 / 25.4;

/**
 * The bottom margin band the validation caption lives in (≈14 mm). The caption
 * baseline is positioned inside this band; the slightly larger QR (≈16 mm) is
 * bottom-aligned at the same padding so it never rides up into body content.
 */
const BAND_MM = 14;
/** QR side on the stamp (≈16 mm); bottom-aligned so it never rides up. */
const QR_MM = 16;
/** Padding from the page's left/bottom edges to the stamp, in mm. */
const PAD_MM = 4;

/**
 * QR options for the embedded validation stamp: medium error correction
 * (survives a print + a scuff), tight quiet zone, generous pixels so it stays
 * crisp scaled into ~16 mm. `toBuffer` yields raw PNG bytes for pdf-lib's
 * `embedPng` (the cert path's `toDataURL` is for inline HTML; here we embed the
 * PNG directly, no data-URI round-trip).
 */
const STAMP_QR_OPTIONS: QRCodeToBufferOptions = {
  errorCorrectionLevel: 'M',
  margin: 1,
  width: 512,
  color: { dark: '#2B2A28', light: '#FFFFFF' },
};

/**
 * Render `text` to QR-code PNG bytes (for pdf-lib embedding). Reuses the same
 * `qrcode` library + settings family the certificate path uses, but returns the
 * raw PNG bytes rather than a data-URI.
 */
export function renderQrPng(text: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    QRCode.toBuffer(text, STAMP_QR_OPTIONS, (err, buffer) => {
      if (err) reject(err);
      else resolve(new Uint8Array(buffer));
    });
  });
}

/** Clamp a fraction into the closed unit interval (defends against bad input). */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Draw the compact validation stamp into one page's bottom margin: the QR at
 * the left, bottom-aligned in the band, and the caption line baseline-aligned
 * beside it. Pure geometry in pdf-lib's BOTTOM-LEFT coordinate space.
 */
function drawValidationStamp(
  page: PDFPage,
  qrImage: PDFImage,
  documentId: string,
  issueDateIso: string,
  font: PDFFont,
): void {
  const pad = PAD_MM * PT_PER_MM;
  const qrSide = QR_MM * PT_PER_MM;
  const band = BAND_MM * PT_PER_MM;

  // QR bottom-left corner: padded from the page's bottom-left. The QR is
  // bottom-aligned at the same pad so its top stays at ~pad+16 mm — never
  // reaching up into typical body content.
  const qrX = pad;
  const qrY = pad;
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSide, height: qrSide });

  // Caption: a single faint line whose baseline sits within the ~14 mm band,
  // vertically centred against the band beside the QR. The §F contract line
  // (`dmj.one Trusted Document · <documentId> · verify at verify.dmj.one`) plus
  // the issue date, which the StampInput.issueDateIso field is documented to show.
  // ASCII + the WinAnsi-encodable middle dot (·, U+00B7) only — any glyph the
  // standard font cannot encode would make drawText throw at runtime; the id and
  // date are both ASCII (`DMJ-DOC-…`, `YYYY-MM-DD`).
  const caption = `dmj.one Trusted Document · ${documentId} · ${issueDateIso} · verify at verify.dmj.one`;
  const fontSize = 7.5;
  const textX = qrX + qrSide + pad;
  const textY = pad + band / 2 - fontSize / 2;
  page.drawText(caption, {
    x: textX,
    y: textY,
    size: fontSize,
    font,
    color: rgb(0.36, 0.33, 0.3),
  });
}

/**
 * Draw the optional handwritten-signature PNG on one placement page. The
 * placement fractions are TOP-LEFT origin (UI space); pdf-lib is BOTTOM-LEFT,
 * so `pdfY = H - (yPct·H) - height`. Width is `wPct·W`; height follows the
 * image's own aspect ratio.
 */
function drawSignature(
  page: PDFPage,
  sigImage: PDFImage,
  placement: SignaturePlacement,
): void {
  const { width: W, height: H } = page.getSize();
  const sigWidth = clamp01(placement.wPct) * W;
  // Preserve the PNG aspect ratio: height = width · (imgH / imgW).
  const height = sigWidth * (sigImage.height / sigImage.width);
  const x = clamp01(placement.xPct) * W;
  // TOP-LEFT yPct → pdf-lib BOTTOM-LEFT y of the image's bottom edge.
  const y = H - clamp01(placement.yPct) * H - height;
  page.drawImage(sigImage, { x, y, width: sigWidth, height });
}

/**
 * Stamp an uploaded PDF with the visible validation mark on every page (+ an
 * optional handwritten-signature stamp on each of its placement pages) and
 * return NEW bytes carrying a classic xref table.
 *
 * @throws if the input cannot be parsed by pdf-lib (the route validates the
 * `%PDF-` header / runs {@link inspectPdf} first, so a malformed upload is
 * rejected before reaching here; this is the defence-in-depth backstop).
 */
export async function stampAttestation(input: StampInput): Promise<Uint8Array> {
  const { pdfBytes, documentId, verifyUrl, issueDateIso, signature } = input;

  const pdf = await PDFDocument.load(pdfBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  // One QR (the verify URL is identical on every page) embedded once and drawn
  // on each page — no per-page re-encode or re-embed.
  const qrPngBytes = await renderQrPng(verifyUrl);
  const qrImage = await pdf.embedPng(qrPngBytes);

  const pages = pdf.getPages();
  for (const page of pages) {
    drawValidationStamp(page, qrImage, documentId, issueDateIso, font);
  }

  // Optional handwritten signature: embed the PNG once, then draw it on each of
  // its placement pages at that page's own position and size. Out-of-range pages
  // are skipped (defence in depth; the route bounds page>=1 but not <=pageCount).
  if (signature !== undefined) {
    const sigImage = await pdf.embedPng(signature.pngBytes);
    for (const placement of signature.placements) {
      const target = pages[placement.page - 1];
      if (target !== undefined) {
        drawSignature(target, sigImage, placement);
      }
    }
  }

  // CLASSIC xref table (PAdES-compatible) — see the module header.
  const out = await pdf.save({ useObjectStreams: false });
  // pdf-lib returns a fresh Uint8Array; return it directly (already NEW bytes).
  return out;
}
