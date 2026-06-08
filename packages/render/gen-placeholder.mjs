// One-off: generate a NON-PERSONAL "Specimen" placeholder signature (transparent
// PNG) and write it as packages/render/src/placeholder-signature.ts. This is the
// fallback used for local dev + tests; the REAL signature is provided at runtime
// via SIGNATURE_PNG_BASE64 (mounted from Secret Manager) and is never committed.
//   node packages/render/gen-placeholder.mjs    (run from the repo root)
import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';

const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>', { waitUntil: 'load' });
const png = await page.evaluate(() => {
  const w = 380, h = 130;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(110,112,124,0.5)';
  ctx.font = 'italic 46px Georgia, "Times New Roman", serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('Specimen', 22, h * 0.46);
  ctx.font = '12px Arial, sans-serif';
  ctx.fillStyle = 'rgba(110,112,124,0.6)';
  ctx.fillText('signature placeholder — not a real signature', 24, h * 0.82);
  return cv.toDataURL('image/png');
});
await browser.close();

const bytes = Buffer.from(png.split(',')[1], 'base64');
const b64 = bytes.toString('base64');
const chunks = b64.match(/.{1,76}/g).map((s) => `  '${s}'`).join(' +\n');
const ts = `/**
 * A NON-PERSONAL "Specimen" placeholder signature (transparent PNG), used for
 * local dev + tests when \`SIGNATURE_PNG_BASE64\` is unset. In production the real
 * signature is provided via that env var (mounted from the Secret Manager secret
 * \`signature-png\`); the real signature is NEVER committed to this repo.
 *
 * Regenerate with \`node packages/render/gen-placeholder.mjs\`.
 */
export const PLACEHOLDER_SIGNATURE_PNG_BASE64 =
${chunks};
`;
writeFileSync('packages/render/src/placeholder-signature.ts', ts);
console.log('placeholder written:', bytes.length, 'bytes,', b64.length, 'b64 chars');
