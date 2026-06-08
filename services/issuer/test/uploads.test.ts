/**
 * Mode 3 — upload-&-attest routes: inspect / preview / sign.
 *
 * These routes call the REAL @dmjone/render `inspectPdf` / `stampAttestation`
 * (not deps fakes), so the fixtures below are genuine 1- and 2-page A4 PDFs
 * (minted with pdf-lib). The signer is faked, so the signed response is the
 * fake's `%PDF` sentinel — "stamping happens before signing" is proven by
 * spying on `signer.sign` and asserting the bytes it received are a PDF strictly
 * larger than the raw upload (the stamp adds a QR + caption per page).
 *
 *   - inspect returns pageCount + per-page sizes + originalSha256 (no side effects);
 *   - preview returns a stamped application/pdf (no side effects);
 *   - sign creates a kind:'upload' record + both blobs and returns the signed
 *     PDF + X-Document-Id;
 *   - oversize / non-PDF inputs are rejected with a uniform 400/413.
 */

import { createHash } from 'node:crypto';

import { ERROR_CODE } from '@dmjone/shared';
import type { UploadAttestation } from '@dmjone/shared';
import { describe, expect, it, vi } from 'vitest';

import { createIssuerApp } from '../src/app.js';
import { buildDeps } from './fakes.js';
import { mintSessionCookie } from './session-helper.js';

const INSPECT_PATH = '/api/uploads/inspect';
const PREVIEW_PATH = '/api/uploads/preview';
const SIGN_PATH = '/api/uploads';

/** A genuine 1-page A4 PDF (pdf-lib, classic xref), base64. */
const ONE_PAGE_PDF_B64 =
  'JVBERi0xLjcKJYGBgYEKCjEgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFsgNSAwIFIgXQovQ291bnQgMQo+PgplbmRvYmoKCjIgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDEgMCBSCj4+CmVuZG9iagoKMyAwIG9iago8PAovUHJvZHVjZXIgPEZFRkYwMDcwMDA2NDAwNjYwMDJEMDA2QzAwNjkwMDYyMDAyMDAwMjgwMDY4MDA3NDAwNzQwMDcwMDA3MzAwM0EwMDJGMDAyRjAwNjcwMDY5MDA3NDAwNjgwMDc1MDA2MjAwMkUwMDYzMDA2RjAwNkQwMDJGMDA0ODAwNkYwMDcwMDA2NDAwNjkwMDZFMDA2NzAwMkYwMDcwMDA2NDAwNjYwMDJEMDA2QzAwNjkwMDYyMDAyOT4KL01vZERhdGUgKEQ6MjAyNjA2MDgwMjI3NDJaKQovQ3JlYXRvciA8RkVGRjAwNzAwMDY0MDA2NjAwMkQwMDZDMDA2OTAwNjIwMDIwMDAyODAwNjgwMDc0MDA3NDAwNzAwMDczMDAzQTAwMkYwMDJGMDA2NzAwNjkwMDc0MDA2ODAwNzUwMDYyMDAyRTAwNjMwMDZGMDA2RDAwMkYwMDQ4MDA2RjAwNzAwMDY0MDA2OTAwNkUwMDY3MDAyRjAwNzAwMDY0MDA2NjAwMkQwMDZDMDA2OTAwNjIwMDI5PgovQ3JlYXRpb25EYXRlIChEOjIwMjYwNjA4MDIyNzQyWikKPj4KZW5kb2JqCgo0IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9TdWJ0eXBlIC9UeXBlMQovQmFzZUZvbnQgL0hlbHZldGljYQovRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZwo+PgplbmRvYmoKCjUgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAxIDAgUgovUmVzb3VyY2VzIDw8Ci9Gb250IDw8Ci9IZWx2ZXRpY2EtNzA5ODQ4MDc4OSA0IDAgUgo+PgovWE9iamVjdCA8PAo+PgovRXh0R1N0YXRlIDw8Cj4+Cj4+Ci9NZWRpYUJveCBbIDAgMCA1OTUuMjggODQxLjg5IF0KL0Fubm90cyBbIF0KL0NvbnRlbnRzIFsgNiAwIFIgXQo+PgplbmRvYmoKCjYgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCAxMTMKPj4Kc3RyZWFtCnicHYq9CsJAEAb77ym2FsTdu/25gFiIEQsbYV9AJIpBC0V8/hiZqYZ5YZtgmnnfsDoMj+/wuV/Oy+CuaeNoHUmjvKIo5RHyX4Wi/GTKJ9amblFDC7v63muY79y8n0uwi4db4SobyhG5QJ84YQJzCBovCmVuZHN0cmVhbQplbmRvYmoKCnhyZWYKMCA3CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNiAwMDAwMCBuIAowMDAwMDAwMDc2IDAwMDAwIG4gCjAwMDAwMDAxMjYgMDAwMDAgbiAKMDAwMDAwMDU5NiAwMDAwMCBuIAowMDAwMDAwNjk0IDAwMDAwIG4gCjAwMDAwMDA4OTUgMDAwMDAgbiAKCnRyYWlsZXIKPDwKL1NpemUgNwovUm9vdCAyIDAgUgovSW5mbyAzIDAgUgo+PgoKc3RhcnR4cmVmCjEwODEKJSVFT0Y=';

/** A genuine 2-page A4 PDF (pdf-lib, classic xref), base64. */
const TWO_PAGE_PDF_B64 =
  'JVBERi0xLjcKJYGBgYEKCjEgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFsgNSAwIFIgNyAwIFIgXQovQ291bnQgMgo+PgplbmRvYmoKCjIgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDEgMCBSCj4+CmVuZG9iagoKMyAwIG9iago8PAovUHJvZHVjZXIgPEZFRkYwMDcwMDA2NDAwNjYwMDJEMDA2QzAwNjkwMDYyMDAyMDAwMjgwMDY4MDA3NDAwNzQwMDcwMDA3MzAwM0EwMDJGMDAyRjAwNjcwMDY5MDA3NDAwNjgwMDc1MDA2MjAwMkUwMDYzMDA2RjAwNkQwMDJGMDA0ODAwNkYwMDcwMDA2NDAwNjkwMDZFMDA2NzAwMkYwMDcwMDA2NDAwNjYwMDJEMDA2QzAwNjkwMDYyMDAyOT4KL01vZERhdGUgKEQ6MjAyNjA2MDgwMjI3NDJaKQovQ3JlYXRvciA8RkVGRjAwNzAwMDY0MDA2NjAwMkQwMDZDMDA2OTAwNjIwMDIwMDAyODAwNjgwMDc0MDA3NDAwNzAwMDczMDAzQTAwMkYwMDJGMDA2NzAwNjkwMDc0MDA2ODAwNzUwMDYyMDAyRTAwNjMwMDZGMDA2RDAwMkYwMDQ4MDA2RjAwNzAwMDY0MDA2OTAwNkUwMDY3MDAyRjAwNzAwMDY0MDA2NjAwMkQwMDZDMDA2OTAwNjIwMDI5PgovQ3JlYXRpb25EYXRlIChEOjIwMjYwNjA4MDIyNzQyWikKPj4KZW5kb2JqCgo0IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9TdWJ0eXBlIC9UeXBlMQovQmFzZUZvbnQgL0hlbHZldGljYQovRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZwo+PgplbmRvYmoKCjUgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAxIDAgUgovUmVzb3VyY2VzIDw8Ci9Gb250IDw8Ci9IZWx2ZXRpY2EtNzA5ODQ4MDc4OSA0IDAgUgo+PgovWE9iamVjdCA8PAo+PgovRXh0R1N0YXRlIDw8Cj4+Cj4+Ci9NZWRpYUJveCBbIDAgMCA1OTUuMjggODQxLjg5IF0KL0Fubm90cyBbIF0KL0NvbnRlbnRzIFsgNiAwIFIgXQo+PgplbmRvYmoKCjYgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCAxMTMKPj4Kc3RyZWFtCnicHYq9CsJAEAb77ym2FsTdu/25gFiIEQsbYV9AJIpBC0V8/hiZqYZ5YZtgmnnfsDoMj+/wuV/Oy+CuaeNoHUmjvKIo5RHyX4Wi/GTKJ9amblFDC7v63muY79y8n0uwi4db4SobyhG5QJ84YQJzCBovCmVuZHN0cmVhbQplbmRvYmoKCjcgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAxIDAgUgovUmVzb3VyY2VzIDw8Ci9Gb250IDw8Ci9IZWx2ZXRpY2EtOTc0MjY4MjU2OCA0IDAgUgo+PgovWE9iamVjdCA8PAo+PgovRXh0R1N0YXRlIDw8Cj4+Cj4+Ci9NZWRpYUJveCBbIDAgMCA1OTUuMjggODQxLjg5IF0KL0Fubm90cyBbIF0KL0NvbnRlbnRzIFsgOCAwIFIgXQo+PgplbmRvYmoKCjggMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCAxMTMKPj4Kc3RyZWFtCnicHYqxCsJAEAX79xVbC+Ld3u3bE8RCjFjYCPsDIlEMWiji9yeRmWqYN3aBJDOfO1bH/vnrv4/rZbn2qmxqbJKbxA1aJU7I/zWL62SSeGFjleZl2hMrDyxu3NPYzcUTM52mqehWYkAs0AXOGAFyIRotCmVuZHN0cmVhbQplbmRvYmoKCnhyZWYKMCA5CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNiAwMDAwMCBuIAowMDAwMDAwMDgyIDAwMDAwIG4gCjAwMDAwMDAxMzIgMDAwMDAgbiAKMDAwMDAwMDYwMiAwMDAwMCBuIAowMDAwMDAwNzAwIDAwMDAwIG4gCjAwMDAwMDA5MDEgMDAwMDAgbiAKMDAwMDAwMTA4NyAwMDAwMCBuIAowMDAwMDAxMjg4IDAwMDAwIG4gCgp0cmFpbGVyCjw8Ci9TaXplIDkKL1Jvb3QgMiAwIFIKL0luZm8gMyAwIFIKPj4KCnN0YXJ0eHJlZgoxNDc0CiUlRU9G';

/** Decode a base64 fixture to bytes. */
function bytesOf(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

async function authedPost(
  app: ReturnType<typeof createIssuerApp>,
  cookie: string,
  path: string,
  body: unknown,
): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
function isPdf(bytes: Uint8Array): boolean {
  return PDF_MAGIC.every((b, i) => bytes[i] === b);
}

// ──────────────────────────── inspect ──────────────────────────────────────

describe('POST /api/uploads/inspect', () => {
  it('returns pageCount, per-page sizes, and originalSha256 (1 page)', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, INSPECT_PATH, { pdfBase64: ONE_PAGE_PDF_B64 });

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      pageCount: number;
      pages: Array<{ widthPt: number; heightPt: number }>;
      originalSha256: string;
    };
    expect(json.pageCount).toBe(1);
    expect(json.pages).toHaveLength(1);
    // A4 portrait in points.
    expect(Math.round(json.pages[0]!.widthPt)).toBe(595);
    expect(Math.round(json.pages[0]!.heightPt)).toBe(842);
    // originalSha256 is the digest of the RAW bytes.
    const expected = createHash('sha256').update(bytesOf(ONE_PAGE_PDF_B64)).digest('hex');
    expect(json.originalSha256).toBe(expected);
  });

  it('returns pageCount 2 for the two-page fixture', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, INSPECT_PATH, { pdfBase64: TWO_PAGE_PDF_B64 });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { pageCount: number }).pageCount).toBe(2);
  });

  it('is side-effect-free (no record, no blob, no audit)', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    await authedPost(app, cookie, INSPECT_PATH, { pdfBase64: ONE_PAGE_PDF_B64 });

    expect(deps.credentialRepo.records.size).toBe(0);
    expect(deps.blobStore.blobs.size).toBe(0);
    expect(deps.auditLog.events).toHaveLength(0);
    expect(deps.logRepo.leaves).toHaveLength(0);
  });

  it('rejects a non-PDF buffer with a uniform 400', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    // Valid base64, but the decoded bytes are not a PDF (no %PDF- header).
    const notPdf = Buffer.from('this is plainly not a pdf file at all').toString('base64');
    const res = await authedPost(app, cookie, INSPECT_PATH, { pdfBase64: notPdf });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(ERROR_CODE.BAD_REQUEST);
  });

  it('requires authentication', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const res = await app.request(INSPECT_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pdfBase64: ONE_PAGE_PDF_B64 }),
    });
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────── preview ──────────────────────────────────────

describe('POST /api/uploads/preview', () => {
  it('returns a stamped application/pdf with the preview headers', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, PREVIEW_PATH, { pdfBase64: ONE_PAGE_PDF_B64 });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('inline; filename="upload-preview.pdf"');
    expect(res.headers.get('cache-control')).toBe('no-store');

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(isPdf(bytes)).toBe(true);
    // The stamp (QR + caption) makes the result larger than the raw upload.
    expect(bytes.byteLength).toBeGreaterThan(bytesOf(ONE_PAGE_PDF_B64).byteLength);
  });

  it('stamps a larger result when the handwritten signature is placed', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const plain = await authedPost(app, cookie, PREVIEW_PATH, { pdfBase64: ONE_PAGE_PDF_B64 });
    const signed = await authedPost(app, cookie, PREVIEW_PATH, {
      pdfBase64: ONE_PAGE_PDF_B64,
      placeHandwrittenSignature: true,
      signaturePlacements: [{ page: 1, xPct: 0.6, yPct: 0.8, wPct: 0.25 }],
    });

    const plainLen = (await plain.arrayBuffer()).byteLength;
    const signedLen = (await signed.arrayBuffer()).byteLength;
    expect(signed.status).toBe(200);
    // The embedded signature PNG adds bytes over the stamp-only preview.
    expect(signedLen).toBeGreaterThan(plainLen);
  });

  it('draws the signature on EACH placement page (two placements > one)', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const onePage = await authedPost(app, cookie, PREVIEW_PATH, {
      pdfBase64: TWO_PAGE_PDF_B64,
      placeHandwrittenSignature: true,
      signaturePlacements: [{ page: 1, xPct: 0.6, yPct: 0.8, wPct: 0.25 }],
    });
    const twoPages = await authedPost(app, cookie, PREVIEW_PATH, {
      pdfBase64: TWO_PAGE_PDF_B64,
      placeHandwrittenSignature: true,
      signaturePlacements: [
        { page: 1, xPct: 0.6, yPct: 0.8, wPct: 0.25 },
        { page: 2, xPct: 0.1, yPct: 0.1, wPct: 0.3 },
      ],
    });

    expect(onePage.status).toBe(200);
    expect(twoPages.status).toBe(200);
    const oneLen = (await onePage.arrayBuffer()).byteLength;
    const twoLen = (await twoPages.arrayBuffer()).byteLength;
    // A second drawn instance of the (already-embedded) signature adds a content-
    // stream draw op on page 2, so the two-placement render is strictly larger.
    expect(twoLen).toBeGreaterThan(oneLen);
  });

  it('rejects a malformed placement element with a uniform 400', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, PREVIEW_PATH, {
      pdfBase64: ONE_PAGE_PDF_B64,
      placeHandwrittenSignature: true,
      // page 0 is out of bounds (min 1).
      signaturePlacements: [{ page: 0, xPct: 0.5, yPct: 0.5, wPct: 0.25 }],
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(ERROR_CODE.VALIDATION_FAILED);
  });

  it('is side-effect-free (no sign/allocate/store/log/audit)', async () => {
    const deps = buildDeps();
    const sign = vi.spyOn(deps.signer, 'sign');
    const create = vi.spyOn(deps.credentialRepo, 'create');
    const put = vi.spyOn(deps.blobStore, 'put');
    const appendLeaf = vi.spyOn(deps.logRepo, 'appendLeaf');
    const audit = vi.spyOn(deps.auditLog, 'append');
    const hash = vi.spyOn(deps.passwordHasher, 'hash');

    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, PREVIEW_PATH, {
      pdfBase64: ONE_PAGE_PDF_B64,
      placeHandwrittenSignature: true,
      signaturePlacements: [{ page: 1, xPct: 0.6, yPct: 0.8, wPct: 0.25 }],
    });
    expect(res.status).toBe(200);

    expect(sign).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(appendLeaf).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
    expect(deps.credentialRepo.records.size).toBe(0);
    expect(deps.blobStore.blobs.size).toBe(0);
  });

  it('rejects a non-PDF buffer with a uniform 400', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const notPdf = Buffer.from('definitely not a pdf').toString('base64');
    const res = await authedPost(app, cookie, PREVIEW_PATH, { pdfBase64: notPdf });
    expect(res.status).toBe(400);
  });
});

// ──────────────────────────── sign ─────────────────────────────────────────

describe('POST /api/uploads — the attest pipeline', () => {
  function signBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      pdfBase64: ONE_PAGE_PDF_B64,
      originalFilename: 'offer-letter.pdf',
      password: 'a-strong-password', // pragma: allowlist secret
      ...overrides,
    };
  }

  it('mints a DMJ-DOC id, returns the signed PDF + X-Document-Id, attachment', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, SIGN_PATH, signBody());

    expect(res.status).toBe(200);
    const documentId = res.headers.get('x-document-id');
    expect(documentId).toMatch(/^DMJ-DOC-\d{8}-\d{2}$/);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${documentId}.pdf"`);
    expect(res.headers.get('cache-control')).toBe('no-store');

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(isPdf(bytes)).toBe(true);
  });

  it('creates a kind:upload record (filename, sha256, pages) + both blobs', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, SIGN_PATH, signBody());
    const documentId = res.headers.get('x-document-id')!;

    const record = await deps.credentialRepo.getById(documentId);
    expect(record).not.toBeNull();
    expect(record?.kind).toBe('upload');
    expect(record?.status).toBe('valid');
    expect(record?.passwordHash).toBe('$argon2id$fake$a-strong-password');

    const content = record?.content as UploadAttestation;
    expect(content.documentId).toBe(documentId);
    expect(content.originalFilename).toBe('offer-letter.pdf');
    expect(content.pageCount).toBe(1);
    // originalSha256 is the digest of the RAW uploaded bytes (before stamping).
    expect(content.originalSha256).toBe(
      createHash('sha256').update(bytesOf(ONE_PAGE_PDF_B64)).digest('hex'),
    );
    // No signature was requested → no placements recorded.
    expect('signaturePlacements' in content).toBe(false);

    expect(await deps.blobStore.get(documentId, 'certificate')).not.toBeNull();
    expect(await deps.blobStore.get(documentId, 'section63')).not.toBeNull();
  });

  it('stamps the PDF BEFORE signing (signer receives a PDF larger than the raw upload)', async () => {
    const deps = buildDeps();
    const sign = vi.spyOn(deps.signer, 'sign');
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    await authedPost(app, cookie, SIGN_PATH, signBody());

    expect(sign).toHaveBeenCalledTimes(1);
    const signedInput = sign.mock.calls[0]![0] as Uint8Array;
    // The bytes handed to the signer are the STAMPED bytes: a valid PDF, strictly
    // larger than the raw upload (the stamp added a QR + caption on the page).
    expect(isPdf(signedInput)).toBe(true);
    expect(signedInput.byteLength).toBeGreaterThan(bytesOf(ONE_PAGE_PDF_B64).byteLength);
  });

  it('records the placements when the handwritten signature is requested', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(
      app,
      cookie,
      SIGN_PATH,
      signBody({
        placeHandwrittenSignature: true,
        signaturePlacements: [{ page: 1, xPct: 0.6, yPct: 0.82, wPct: 0.22 }],
      }),
    );
    const documentId = res.headers.get('x-document-id')!;
    const record = await deps.credentialRepo.getById(documentId);
    const content = record?.content as UploadAttestation;
    expect(content.signaturePlacements).toEqual([{ page: 1, xPct: 0.6, yPct: 0.82, wPct: 0.22 }]);
  });

  it('records MULTIPLE per-page placements (each its own position + size)', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(
      app,
      cookie,
      SIGN_PATH,
      signBody({
        pdfBase64: TWO_PAGE_PDF_B64,
        placeHandwrittenSignature: true,
        // Sent out of page order; the canonical builder sorts by page.
        signaturePlacements: [
          { page: 2, xPct: 0.1, yPct: 0.1, wPct: 0.3 },
          { page: 1, xPct: 0.6, yPct: 0.82, wPct: 0.22 },
        ],
      }),
    );
    const documentId = res.headers.get('x-document-id')!;
    const record = await deps.credentialRepo.getById(documentId);
    const content = record?.content as UploadAttestation;
    expect(content.signaturePlacements).toEqual([
      { page: 2, xPct: 0.1, yPct: 0.1, wPct: 0.3 },
      { page: 1, xPct: 0.6, yPct: 0.82, wPct: 0.22 },
    ]);
    // The audit marks it signed (≥1 placement).
    const ev = deps.auditLog.events.find((e) => e.action === 'upload.attest');
    expect(ev?.meta?.signed).toBe(true);
  });

  it('sanitizes a path-y / unsafe filename to a safe basename', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(
      app,
      cookie,
      SIGN_PATH,
      signBody({ originalFilename: '../../etc/pa ss*wd.pdf' }),
    );
    const documentId = res.headers.get('x-document-id')!;
    const content = (await deps.credentialRepo.getById(documentId))?.content as UploadAttestation;
    // path stripped to the basename; '*' → '_'; spaces/dots/dashes kept.
    expect(content.originalFilename).toBe('pa ss_wd.pdf');
  });

  it('rejects a missing password with VALIDATION_FAILED (no record written)', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const body = signBody();
    delete body.password;
    const res = await authedPost(app, cookie, SIGN_PATH, body);

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(ERROR_CODE.VALIDATION_FAILED);
    expect(deps.credentialRepo.createCount).toBe(0);
  });

  it('rejects a non-PDF upload with a uniform 400 (no record written)', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const notPdf = Buffer.from('not a pdf, just text').toString('base64');
    const res = await authedPost(app, cookie, SIGN_PATH, signBody({ pdfBase64: notPdf }));

    expect(res.status).toBe(400);
    expect(deps.credentialRepo.createCount).toBe(0);
  });

  it('rejects an oversize PDF (> 10 MiB) with 413', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    // A base64 string whose decoded length exceeds 10 MiB. We do not need real
    // PDF content — the size cap fires before any parsing.
    const oversize = 'A'.repeat(Math.ceil((11 * 1024 * 1024 * 4) / 3));
    const res = await authedPost(app, cookie, SIGN_PATH, signBody({ pdfBase64: oversize }));

    expect(res.status).toBe(413);
    expect(deps.credentialRepo.createCount).toBe(0);
  });

  it('requires authentication', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const res = await app.request(SIGN_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(signBody()),
    });
    expect(res.status).toBe(401);
    expect(deps.credentialRepo.createCount).toBe(0);
  });
});
