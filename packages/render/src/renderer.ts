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
import type { CertificateRenderer, CredentialContent, RenderOptions } from '@dmjone/shared';
import { buildCertificateHtml } from './template.js';
import { createChromiumRenderer, type ChromiumRendererOptions, type HtmlToPdf } from './chromium.js';

export interface CertificateRendererOptions extends ChromiumRendererOptions {
  /**
   * Inject the HTML→PDF step. Defaults to a fresh Chromium renderer built from
   * the chromium options. Tests pass a fake to avoid launching a browser.
   */
  htmlToPdf?: HtmlToPdf;
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

/** Build a {@link CertificateRenderer}. Pure DI: no globals, no hidden state. */
export function createCertificateRenderer(
  opts: CertificateRendererOptions = {},
): CertificateRenderer {
  const htmlToPdf: HtmlToPdf = opts.htmlToPdf ?? createChromiumRenderer(opts);

  return {
    async render(content: CredentialContent, renderOpts: RenderOptions): Promise<Uint8Array> {
      const qrDataUri = await QRCode.toDataURL(renderOpts.qrUrl, QR_OPTIONS);
      const html = buildCertificateHtml({ content, qrDataUri });
      return htmlToPdf(html);
    },
  };
}
