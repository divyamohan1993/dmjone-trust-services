/**
 * Bundled visual assets for the certificate PDF: the three brand images and the
 * four font families, all read from disk once and inlined as base64 data-URIs.
 *
 * Why inline: the PDF must render with zero network access (Cloud Run container,
 * offline, deterministic appearance). Google Fonts links and external <img src>
 * are forbidden — every byte the renderer needs ships inside the HTML string.
 *
 * Reads are anchored to {@link import.meta.url}, never the process cwd, so they
 * resolve identically whether invoked from src (vitest/tsc) or dist (runtime),
 * and survive pnpm's symlinked node_modules layout via require.resolve.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PLACEHOLDER_SIGNATURE_PNG_BASE64 } from './placeholder-signature.js';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

/**
 * The images VENDORED INTO this package at `packages/render/assets/` — NOT the
 * repo-root `assets/`, which does not exist in the pruned Cloud Run container.
 * `src` and `dist` are both exactly one level under `packages/render`, so the
 * single hop up is identical before and after a build.
 */
const ASSETS_DIR = join(here, '..', 'assets');

function fileToDataUri(absPath: string, mime: string): string {
  const b64 = readFileSync(absPath).toString('base64');
  return `data:${mime};base64,${b64}`;
}

/**
 * The handwritten-signature PNG as base64. In PRODUCTION this is the
 * `SIGNATURE_PNG_BASE64` env var, mounted from the Secret Manager secret
 * `signature-png` — the real signature is NEVER committed to this repo (it would
 * be scraped from the public GitHub mirror). When the env var is absent (local
 * dev / tests) the non-personal "Specimen" placeholder is used instead.
 */
function signaturePngBase64(): string {
  const fromEnv = process.env['SIGNATURE_PNG_BASE64'];
  return fromEnv && fromEnv.length > 0 ? fromEnv : PLACEHOLDER_SIGNATURE_PNG_BASE64;
}

/** The signature PNG bytes — the env-provided real signature, else the placeholder. */
export function getSignaturePngBytes(): Uint8Array {
  return new Uint8Array(Buffer.from(signaturePngBase64(), 'base64'));
}

/** One @font-face source: a resolvable @fontsource woff2 + its CSS descriptors. */
interface FontFace {
  family: string;
  /** Module specifier passed to require.resolve (robust to pnpm symlinks). */
  file: string;
  weight: number;
  style: 'normal' | 'italic';
}

/**
 * Exactly the weights/styles the template uses, mapped to the installed
 * @fontsource woff2 files:
 *   EB Garamond  400 normal+italic, 500 italic, 600 normal  (--serif)
 *   Playfair Display 600 (recipient), 700 (title)           (--display)
 *   Marcellus    400                                         (--label)
 *   Great Vibes  400                                         (--script)
 */
const FONT_FACES: readonly FontFace[] = [
  {
    family: 'EB Garamond',
    file: '@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff2',
    weight: 400,
    style: 'normal',
  },
  {
    family: 'EB Garamond',
    file: '@fontsource/eb-garamond/files/eb-garamond-latin-400-italic.woff2',
    weight: 400,
    style: 'italic',
  },
  {
    family: 'EB Garamond',
    file: '@fontsource/eb-garamond/files/eb-garamond-latin-500-italic.woff2',
    weight: 500,
    style: 'italic',
  },
  {
    family: 'EB Garamond',
    file: '@fontsource/eb-garamond/files/eb-garamond-latin-600-normal.woff2',
    weight: 600,
    style: 'normal',
  },
  {
    family: 'Playfair Display',
    file: '@fontsource/playfair-display/files/playfair-display-latin-600-normal.woff2',
    weight: 600,
    style: 'normal',
  },
  {
    family: 'Playfair Display',
    file: '@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2',
    weight: 700,
    style: 'normal',
  },
  {
    family: 'Marcellus',
    file: '@fontsource/marcellus/files/marcellus-latin-400-normal.woff2',
    weight: 400,
    style: 'normal',
  },
  {
    family: 'Great Vibes',
    file: '@fontsource/great-vibes/files/great-vibes-latin-400-normal.woff2',
    weight: 400,
    style: 'normal',
  },
];

/** Lazily-built singletons so the disk reads happen once, on first render. */
let imagesCache: BrandImages | undefined;
let fontCssCache: string | undefined;

export interface BrandImages {
  /** Round watercolour logo (masthead). */
  logo: string;
  /** Handwritten signature (signature block). */
  signature: string;
  /** Faint full-page watermark. */
  watermark: string;
}

/** The three brand images as base64 data-URIs, read once and cached. */
export function getBrandImages(): BrandImages {
  if (!imagesCache) {
    imagesCache = {
      logo: fileToDataUri(join(ASSETS_DIR, 'logo-round.png'), 'image/png'),
      signature: `data:image/png;base64,${signaturePngBase64()}`,
      watermark: fileToDataUri(join(ASSETS_DIR, 'watermark.png'), 'image/png'),
    };
  }
  return imagesCache;
}

/**
 * A `<style>`-ready block of @font-face rules, every font embedded as a base64
 * woff2 data-URI. `font-display:block` so glyphs never fall back to a system
 * serif mid-render; we pair this with `document.fonts.ready` before printing.
 */
export function getFontFaceCss(): string {
  if (!fontCssCache) {
    fontCssCache = FONT_FACES.map((f) => {
      const dataUri = fileToDataUri(require.resolve(f.file), 'font/woff2');
      return [
        '@font-face{',
        `font-family:"${f.family}";`,
        `font-style:${f.style};`,
        `font-weight:${f.weight};`,
        'font-display:block;',
        `src:url(${dataUri}) format("woff2");`,
        '}',
      ].join('');
    }).join('\n');
  }
  return fontCssCache;
}
