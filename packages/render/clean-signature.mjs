// One-off: turn the noisy JPEG signature into a clean, high-quality transparent
// PNG (white background removed, JPEG speckle/ringing despeckled, ink recoloured
// to a uniform crisp blue, supersampled for a sharp stamp). Uses the render
// package's puppeteer (canvas pixel-processing) — no new dependency.
//
//   node packages/render/clean-signature.mjs    (run from the repo root)
//
// Writes packages/render/assets/signature.png + assets/signature.png, and
// regenerates services/issuer/src/issuance/signature-asset.ts with the new bytes.
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'node:fs';

const srcJpg = 'packages/render/assets/signature.jpg';
const dataUri = 'data:image/jpeg;base64,' + readFileSync(srcJpg).toString('base64');

const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>', { waitUntil: 'load' });

const result = await page.evaluate(async (uri) => {
  const img = new Image();
  img.src = uri;
  await img.decode();
  const sw = img.naturalWidth, sh = img.naturalHeight;
  // Supersample so the stamp is crisp when scaled onto an A4 page.
  let scale = 720 / Math.max(sw, sh);
  scale = Math.min(4, Math.max(1, scale));
  const w = Math.round(sw * scale), h = Math.round(sh * scale);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data, n = w * h;

  // 1) Alpha from "not-whiteness": white bg -> 0, coloured ink -> opaque, edges
  //    smooth. Boost ink, then drop faint JPEG haze/ringing to fully transparent.
  const alpha = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    let a = (255 - Math.min(r, g, b)) * 1.25;
    if (a > 255) a = 255;
    if (a < 60) a = 0;
    alpha[i] = a;
  }
  // 2) Average ink colour (over strongly inked pixels), deepened slightly.
  let sr = 0, sg = 0, sb = 0, c = 0;
  for (let i = 0; i < n; i++) if (alpha[i] > 180) { sr += d[i * 4]; sg += d[i * 4 + 1]; sb += d[i * 4 + 2]; c++; }
  let ir = c ? Math.round((sr / c) * 0.85) : 26;
  let ig = c ? Math.round((sg / c) * 0.85) : 54;
  let ib = c ? Math.min(255, Math.round((sb / c) * 0.95)) : 168;
  // 3) Despeckle: 8-connected components on alpha>0; drop tiny isolated blobs
  //    (the scan/JPEG specks) while keeping the real strokes.
  const lbl = new Int32Array(n).fill(-1);
  const sizes = [];
  let comp = 0;
  for (let i = 0; i < n; i++) {
    if (alpha[i] > 0 && lbl[i] === -1) {
      let size = 0; lbl[i] = comp; const st = [i];
      while (st.length) {
        const p = st.pop(); size++;
        const px = p % w, py = (p - px) / w;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (alpha[q] > 0 && lbl[q] === -1) { lbl[q] = comp; st.push(q); }
        }
      }
      sizes[comp++] = size;
    }
  }
  const maxSize = Math.max(1, ...sizes);
  const minKeep = Math.max(8, Math.round(maxSize * 0.0025));
  // 4) Write output: uniform ink colour + smooth alpha; specks & bg transparent.
  let inkPixels = 0;
  for (let i = 0; i < n; i++) {
    let a = alpha[i];
    if (a > 0 && sizes[lbl[i]] < minKeep) a = 0;
    if (a > 0) { d[i * 4] = ir; d[i * 4 + 1] = ig; d[i * 4 + 2] = ib; d[i * 4 + 3] = a; inkPixels++; }
    else { d[i * 4] = 0; d[i * 4 + 1] = 0; d[i * 4 + 2] = 0; d[i * 4 + 3] = 0; }
  }
  ctx.putImageData(id, 0, 0);
  return { png: cv.toDataURL('image/png'), sw, sh, w, h, ink: [ir, ig, ib], inkPixels, components: comp, minKeep };
}, dataUri);

await browser.close();

const pngBytes = Buffer.from(result.png.split(',')[1], 'base64');
writeFileSync('packages/render/assets/signature.png', pngBytes);
writeFileSync('assets/signature.png', pngBytes);

// Regenerate the issuer's vendored base64 PNG (chunked at 76 cols).
const b64 = pngBytes.toString('base64');
const chunks = b64.match(/.{1,76}/g).map((s) => `  '${s}'`).join(' +\n');
const ts = `/**
 * The dmj.one handwritten-signature image, as a clean transparent PNG, for the
 * Mode-3 upload-&-attest stamp (embedded via pdf-lib's \`embedPng\`).
 *
 * Generated from the brand \`signature.jpg\` by \`packages/render/clean-signature.mjs\`:
 * the white background is keyed to transparent, JPEG speckle/ringing is despeckled
 * (small isolated blobs dropped), the ink is recoloured to a uniform crisp blue,
 * and the mark is supersampled (${result.w}x${result.h}) for a sharp stamp. The same
 * asset backs the certificate/letter signature blocks via \`@dmjone/render\`'s
 * \`getBrandImages()\` (now \`signature.png\`).
 *
 * Vendored as base64 (decoded once at module load) so it ships through \`tsc\` into
 * \`dist\` with no asset-copy step. Pure data: no I/O, side-effect-free.
 */
const SIGNATURE_PNG_BASE64 = 'REDACTED-real-signature-now-in-Secret-Manager';

/**
 * The signature PNG bytes, decoded once at module load. A fresh \`Uint8Array\` the
 * caller (the attest pipeline) hands to \`stampAttestation\` as \`signature.pngBytes\`.
 * Never mutated.
 */
export const SIGNATURE_PNG_BYTES: Uint8Array = new Uint8Array(
  Buffer.from(SIGNATURE_PNG_BASE64, 'base64'),
);
`;
writeFileSync('services/issuer/src/issuance/signature-asset.ts', ts);

console.log(JSON.stringify({ source: [result.sw, result.sh], output: [result.w, result.h], ink: result.ink, inkPixels: result.inkPixels, components: result.components, minKeep: result.minKeep, pngBytes: pngBytes.length, b64len: b64.length }, null, 2));
