/**
 * Regenerate the per-service `src/fonts/font-bytes.ts` modules.
 *
 * Reads the eight latin-subset woff2 weights the design system declares from the
 * installed @fontsource packages and emits a base64-embedded TS module into BOTH
 * services (verify + issuer). The bytes are committed, so neither service needs a
 * @fontsource runtime dependency and the in-memory `/fonts/:file` route works in
 * the pruned distroless container with no filesystem or Dockerfile change.
 *
 * Resolution: @fontsource is a dependency of @dmjone/render (not of the services),
 * so we resolve each woff2 relative to this repo's hoisted .pnpm store. Run from
 * the repo root:  node scripts/gen-font-bytes.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

/**
 * The eight files the shared design system's @font-face block references. The
 * key is the public filename the `/fonts/:file` route serves; the value is the
 * @fontsource module specifier resolved against the workspace store.
 */
const FILES = [
  ['eb-garamond-latin-400-normal.woff2', '@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff2'],
  ['eb-garamond-latin-400-italic.woff2', '@fontsource/eb-garamond/files/eb-garamond-latin-400-italic.woff2'],
  ['eb-garamond-latin-500-italic.woff2', '@fontsource/eb-garamond/files/eb-garamond-latin-500-italic.woff2'],
  ['eb-garamond-latin-600-normal.woff2', '@fontsource/eb-garamond/files/eb-garamond-latin-600-normal.woff2'],
  ['playfair-display-latin-600-normal.woff2', '@fontsource/playfair-display/files/playfair-display-latin-600-normal.woff2'],
  ['playfair-display-latin-700-normal.woff2', '@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2'],
  ['marcellus-latin-400-normal.woff2', '@fontsource/marcellus/files/marcellus-latin-400-normal.woff2'],
  ['great-vibes-latin-400-normal.woff2', '@fontsource/great-vibes/files/great-vibes-latin-400-normal.woff2'],
];

/** Resolve a @fontsource woff2 to an absolute path; fall back to the .pnpm store. */
function resolveWoff2(spec) {
  try {
    return require.resolve(spec, { paths: [join(repoRoot, 'packages', 'render')] });
  } catch {
    // The services don't list @fontsource; render does. Resolve from render's view.
    return require.resolve(spec);
  }
}

const header = `/**
 * Self-hosted brand fonts, base64-embedded so the in-memory \`GET /fonts/:file\`
 * route can serve them from a compiled module — no filesystem, no \`assets/\`
 * directory and no @fontsource runtime dependency in the pruned distroless
 * container, and no Dockerfile change. The map is BOTH the byte source AND the
 * allow-list: a request whose filename is not a key is rejected, so there is no
 * path-traversal surface (the only servable files are the eight declared here).
 *
 * GENERATED FILE — do not edit by hand. Regenerate with
 *   node scripts/gen-font-bytes.mjs
 * which reads the latin-subset woff2 weights confirmed on disk in @fontsource
 * (eb-garamond@5.2.7, playfair-display@5.2.8, marcellus@5.2.8, great-vibes@5.2.8)
 * and re-emits this module verbatim into both services. Filenames are
 * content-stable per @fontsource version, matching the immutable Cache-Control
 * the route sets.
 */

/** Decoded once at module load; the route slices fresh ArrayBuffers per response. */
export const FONT_BYTES: Readonly<Record<string, Buffer>> = Object.freeze({
`;

const footer = `});

/** Whether a requested filename is a known, servable brand font (the allow-list). */
export function isFontFile(name: string): name is keyof typeof FONT_BYTES {
  return Object.prototype.hasOwnProperty.call(FONT_BYTES, name);
}
`;

const rows = FILES.map(([name, spec]) => {
  const abs = resolveWoff2(spec);
  const b64 = readFileSync(abs).toString('base64');
  return `  ${JSON.stringify(name)}: Buffer.from(${JSON.stringify(b64)}, 'base64'),`;
});

const out = `${header}${rows.join('\n')}\n${footer}`;

for (const svc of ['verify', 'issuer']) {
  const dir = join(repoRoot, 'services', svc, 'src', 'fonts');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const target = join(dir, 'font-bytes.ts');
  writeFileSync(target, out, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`wrote ${target} (${out.length} chars, ${rows.length} fonts)`);
}
