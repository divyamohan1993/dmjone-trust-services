/**
 * {@link CertificateRenderer} factory (Stream E).
 *
 * `render(content, { qrUrl })` produces the UNSIGNED, pixel-faithful A4 PDF:
 * generate the QR for the public credential URL, build the self-contained HTML
 * (fonts + images inlined), and print it through Chromium. The bytes returned
 * here are what the hybrid signer then PAdES-signs; nothing is signed in this
 * package.
 */

import * as QRCode from 'qrcode';
import type { QRCodeToDataURLOptions } from 'qrcode';
import type {
  CertificateRenderer,
  CredentialContent,
  LetterContent,
  RenderOptions,
} from '@dmjone/shared';
import { buildCertificateHtml } from './template.js';
import { buildLetterHtml } from './letter-template.js';
import { createChromiumRenderer, type ChromiumRendererOptions, type HtmlToPdf } from './chromium.js';

export interface CertificateRendererOptions extends ChromiumRendererOptions {
  /**
   * Inject the HTML→PDF step. Defaults to a fresh Chromium renderer built from
   * the chromium options. Tests pass a fake to avoid launching a browser.
   */
  htmlToPdf?: HtmlToPdf;
}

/**
 * The render package's renderer surface: the frozen {@link CertificateRenderer}
 * contract from `@dmjone/shared` PLUS the Mode-2 letterhead path. Widened HERE
 * (not in `@dmjone/shared`, which is frozen) so `render()`'s signature stays
 * byte-for-byte intact while `renderLetter` rides alongside it. The issuer's
 * Mode-2 issuance (Phase 2B) consumes this type.
 */
export interface TrustedDocumentRenderer extends CertificateRenderer {
  /**
   * Render a letterhead letter (Mode 2) to an UNSIGNED, flowing multi-page A4
   * PDF: generate the QR for the public document URL, build the self-contained
   * letter HTML (fonts + images inlined), and print it through Chromium. The
   * bytes returned are what the hybrid signer then PAdES-signs; nothing is
   * signed in this package.
   */
  renderLetter(content: LetterContent, opts: RenderOptions): Promise<Uint8Array>;
}

/**
 * QR settings: medium error correction (survives the print + a scuff), tight
 * quiet zone, and a generous pixel width so it stays crisp scaled into the
 * 24 mm card.
 */
const QR_OPTIONS: QRCodeToDataURLOptions = {
  errorCorrectionLevel: 'M',
  margin: 1,
  width: 600,
  color: { dark: '#2B2A28', light: '#FFFFFF' },
};

/**
 * Build a {@link TrustedDocumentRenderer}. Pure DI: no globals, no hidden state.
 * Returns the widened type (cert + letter); `render()`'s contract is unchanged.
 */
export function createCertificateRenderer(
  opts: CertificateRendererOptions = {},
): TrustedDocumentRenderer {
  const htmlToPdf: HtmlToPdf = opts.htmlToPdf ?? createChromiumRenderer(opts);

  return {
    async render(content: CredentialContent, renderOpts: RenderOptions): Promise<Uint8Array> {
      const qrDataUri = await QRCode.toDataURL(renderOpts.qrUrl, QR_OPTIONS);
      const html = buildCertificateHtml({ content, qrDataUri });
      return htmlToPdf(html);
    },

    async renderLetter(content: LetterContent, renderOpts: RenderOptions): Promise<Uint8Array> {
      // QR generated exactly as the cert path does (same library + settings),
      // encoding the public document URL; the letter HTML is the flowing,
      // multi-page letterhead document.
      const qrDataUri = await QRCode.toDataURL(renderOpts.qrUrl, QR_OPTIONS);
      const html = buildLetterHtml({ content, qrDataUri });
      return htmlToPdf(html);
    },
  };
}
