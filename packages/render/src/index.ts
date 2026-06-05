/**
 * @dmjone/render — pixel-faithful certificate + §63 rendering (Stream E).
 *
 * Implements the {@link CertificateRenderer} and {@link Section63Generator}
 * contracts from @dmjone/shared via headless Chromium over self-contained HTML
 * (fonts and images inlined as base64; zero network). Everything is exposed as a
 * factory taking its dependencies, so the issuer composition root wires it in.
 */

export { createCertificateRenderer } from './renderer.js';
export type { CertificateRendererOptions } from './renderer.js';

export { createSection63Generator } from './section63.js';
export type { Section63GeneratorDeps } from './section63.js';

// Chromium seam — exported so the issuer can supply a shared/configured browser
// step (e.g. one carrying PUPPETEER_EXECUTABLE_PATH) to both factories.
export { createChromiumRenderer } from './chromium.js';
export type { ChromiumRendererOptions, HtmlToPdf } from './chromium.js';

// Pure HTML builders + helpers — exported for unit testing and reuse without
// launching a browser.
export { buildCertificateHtml } from './template.js';
export type { CertificateTemplateInput } from './template.js';
export { buildSection63Html } from './section63-template.js';
export { getBrandImages, getFontFaceCss } from './assets.js';
export type { BrandImages } from './assets.js';
export { escapeHtml, escapeHtmlWithEmphasis, formatIsoDate } from './html.js';
