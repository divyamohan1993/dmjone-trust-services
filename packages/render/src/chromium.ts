/**
 * The single Chromium → PDF step, shared by the certificate renderer and the
 * §63 generator. Isolating it here means:
 *   - both PDFs go through one audited print path (A4, backgrounds on, no margin);
 *   - the async-font hazard is handled in exactly one place;
 *   - callers can inject a fake {@link HtmlToPdf} to unit-test without a browser.
 */

import puppeteer from 'puppeteer';
import type { Browser, LaunchOptions, PDFOptions } from 'puppeteer';

/** Converts a full HTML document to PDF bytes. The seam used for DI in tests. */
export type HtmlToPdf = (html: string) => Promise<Uint8Array>;

export interface ChromiumRendererOptions {
  /**
   * Explicit Chromium binary. Defaults to `PUPPETEER_EXECUTABLE_PATH` (the Cloud
   * Run container sets this to system Chromium) and otherwise to puppeteer's own
   * downloaded browser.
   */
  executablePath?: string;
  /** Extra launch args appended to the hardened defaults. */
  launchArgs?: readonly string[];
  /**
   * Headless mode. Defaults to `'shell'` (chrome-headless-shell) — the lean
   * mode purpose-built for server-side rendering: it has no GPU/compositor
   * dependencies, starts faster, and is reliable in minimal containers and on
   * Windows hosts where the full new-headless browser can stall on the DevTools
   * endpoint. Pass `true` for the full new-headless browser if needed.
   */
  headless?: boolean | 'shell';
}

/** A4, print backgrounds, zero margin — fixed for every document we produce. */
const PDF_OPTIONS: PDFOptions = {
  format: 'A4',
  printBackground: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  preferCSSPageSize: true,
};

/**
 * Container-safe defaults. `--no-sandbox` is required under the unprivileged,
 * read-only Cloud Run filesystem (no user namespaces); the process is already
 * isolated at the container boundary. `--disable-dev-shm-usage` avoids the tiny
 * default /dev/shm in containers; `--disable-gpu` drops an unneeded dependency
 * for headless PDF.
 */
const BASE_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--font-render-hinting=none',
];

/**
 * Build a reusable {@link HtmlToPdf}. Each call launches a fresh headless
 * browser, prints, and tears it down — simple and leak-free for the issuer's
 * low issue-time volume. The browser and page are closed in `finally` so a
 * render failure never leaks a Chromium process.
 */
export function createChromiumRenderer(opts: ChromiumRendererOptions = {}): HtmlToPdf {
  const executablePath = opts.executablePath ?? process.env['PUPPETEER_EXECUTABLE_PATH'];
  const args = [...BASE_ARGS, ...(opts.launchArgs ?? [])];

  // Default headless mode depends on which browser we launch:
  //   - bundled browser (no explicit path): `'shell'` — puppeteer downloads
  //     chrome-headless-shell, the lean server-render artifact, and the full
  //     new-headless browser can stall on the DevTools endpoint on some hosts.
  //   - explicit/system Chromium (PUPPETEER_EXECUTABLE_PATH set, e.g. the Cloud
  //     Run container): `true` (new headless) — universally supported by any
  //     full Chrome/Chromium build, whereas a system binary may not ship the
  //     separate chrome-headless-shell that `'shell'` mode requires.
  // An explicit `opts.headless` always wins.
  const headless: boolean | 'shell' = opts.headless ?? (executablePath ? true : 'shell');

  // exactOptionalPropertyTypes: only set executablePath when we actually have
  // one — never pass `executablePath: undefined`.
  const launchOptions: LaunchOptions = executablePath
    ? { headless, args, executablePath }
    : { headless, args };

  return async function htmlToPdf(html: string): Promise<Uint8Array> {
    let browser: Browser | undefined;
    try {
      browser = await puppeteer.launch(launchOptions);
      const page = await browser.newPage();
      try {
        // All assets are inline data-URIs, so `load` fires once the document has
        // parsed; the explicit fonts.ready wait below then guards against
        // printing before the base64 @font-face faces have decoded — otherwise
        // the PDF silently falls back to a system serif.
        await page.setContent(html, { waitUntil: 'load' });
        // Runs in the browser context (no DOM lib in this Node tsconfig, hence
        // the cast); resolves when every @font-face has finished loading.
        await page.evaluate(
          () => (globalThis as unknown as { document: { fonts: { ready: Promise<unknown> } } }).document.fonts.ready,
        );
        return await page.pdf(PDF_OPTIONS);
      } finally {
        await page.close();
      }
    } finally {
      if (browser) await browser.close();
    }
  };
}
