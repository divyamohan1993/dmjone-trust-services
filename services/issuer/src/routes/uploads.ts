/**
 * Authenticated upload-&-attest API (Mode 3): inspect + preview + sign.
 *
 * All three routes sit behind {@link requireAdmin}. The PDF arrives base64 in a
 * JSON body; one shared {@link decodePdf} helper validates it (decode, ≤10 MiB,
 * `%PDF-` header) and maps every failure to a uniform 400/413. `inspectPdf`
 * failures (non-PDF / encrypted / corrupt) likewise map to 400.
 *
 *   POST /api/uploads/inspect  → { pageCount, pages:[{widthPt,heightPt}], originalSha256 }
 *                                side-effect-free (no allocation, no store)
 *   POST /api/uploads/preview  → stamp with the PLACEHOLDER id (+ optional sig);
 *                                application/pdf; side-effect-free (NO sign/allocate/
 *                                store/log/audit)
 *   POST /api/uploads          → the full attest pipeline (§C.3); the SIGNED PDF
 *                                bytes (application/pdf, attachment) + X-Document-Id
 *
 * The two previews reuse the cert-preview response idiom (Content-Type, no-store).
 */

import { createHash } from 'node:crypto';

import { Hono } from 'hono';
import type { Context } from 'hono';

import { AppError, ERROR_CODE, signUploadSchema } from '@dmjone/shared';
import type { SignUploadInput, SignaturePlacement } from '@dmjone/shared';
import { stampAttestation, inspectPdf, PdfInspectError } from '@dmjone/render';

import type { IssuerDeps } from '../deps.js';
import type { IssuerHonoEnv } from '../http/context.js';
import { requireAdmin } from '../http/middleware.js';
import { attestUpload } from '../issuance/attest-upload.js';
import { SIGNATURE_PNG_BYTES } from '../issuance/signature-asset.js';

/**
 * Fixed display-only id for the side-effect-free stamp preview. Satisfies
 * {@link CREDENTIAL_ID_REGEX} (`DOC` is 3 letters); never allocated, never
 * stored. The QR on a preview stamp therefore points at the placeholder.
 */
const PREVIEW_UPLOAD_ID = 'DMJ-DOC-00000000-00';

/** 10 MiB cap on the decoded PDF (§C.1). */
const MAX_PDF_BYTES = 10 * 1024 * 1024;

/**
 * Validation lives in `@dmjone/shared` (zod is not an issuer dependency — pnpm
 * isolates it, so it cannot be imported here). The metadata fields ride the
 * exported `signUploadSchema`; the only field added by these routes is the
 * `pdfBase64` transport string and (for inspect/preview) the optional placement,
 * which are hand-validated below — they are a non-empty string and a small,
 * fixed-shape numeric object.
 */

/** Parse a JSON body, normalising any malformed JSON to a uniform 400. */
async function readJson(c: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError(ERROR_CODE.BAD_REQUEST, 'Request body must be valid JSON', 400);
  }
}

/** Narrow an unknown body to a plain object (uniform 400 otherwise). */
function asObject(body: unknown, what: string): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AppError(ERROR_CODE.VALIDATION_FAILED, `Invalid ${what} request`, 400);
  }
  return body as Record<string, unknown>;
}

/** Pull a required non-empty `pdfBase64` string from a body (uniform 400 otherwise). */
function requirePdfBase64(obj: Record<string, unknown>, what: string): string {
  const v = obj['pdfBase64'];
  if (typeof v !== 'string' || v.length === 0) {
    throw new AppError(ERROR_CODE.VALIDATION_FAILED, `Invalid ${what} request: pdfBase64 required`, 400);
  }
  return v;
}

/**
 * Parse the optional preview signature placement: present only when
 * `placeHandwrittenSignature` is true AND a well-formed placement object is
 * supplied. Mirrors `signUploadSchema.signaturePlacement` bounds (page≥1,
 * x/y∈[0,1], w∈[0.02,1]). Returns `undefined` when no signature is to be placed;
 * throws a uniform 400 when a placement is present but malformed.
 */
function parsePreviewPlacement(obj: Record<string, unknown>): SignaturePlacement | undefined {
  if (obj['placeHandwrittenSignature'] !== true) return undefined;
  const p = obj['signaturePlacement'];
  if (typeof p !== 'object' || p === null) return undefined;
  const { page, xPct, yPct, wPct } = p as Record<string, unknown>;
  const inRange = (n: unknown, lo: number, hi: number): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
  if (
    typeof page !== 'number' ||
    !Number.isInteger(page) ||
    page < 1 ||
    !inRange(xPct, 0, 1) ||
    !inRange(yPct, 0, 1) ||
    !inRange(wPct, 0.02, 1)
  ) {
    throw new AppError(ERROR_CODE.VALIDATION_FAILED, 'Invalid signaturePlacement', 400);
  }
  return { page, xPct, yPct, wPct };
}

/**
 * Decode a base64 PDF string to bytes, enforcing the size cap and the `%PDF-`
 * magic. Cheap checks first: a base64 string longer than the byte cap can be
 * rejected without decoding (base64 is ~4/3 the byte size, so > cap×2 chars is
 * definitely over). Then decode, re-check the exact byte length, and require the
 * `%PDF-` header so a non-PDF never reaches the stamping / signing path.
 *
 * @throws AppError(BAD_REQUEST, 413) when over the size cap.
 * @throws AppError(BAD_REQUEST, 400) on a non-base64 / non-PDF buffer.
 */
function decodePdf(pdfBase64: string): Uint8Array {
  // Fast reject: even at 100% efficiency base64 encodes 6 bits/char, so the
  // decoded size ≤ (chars × 3/4). Reject obviously-oversize input before the
  // (potentially large) allocation.
  if (pdfBase64.length > Math.ceil((MAX_PDF_BYTES * 4) / 3) + 4) {
    throw new AppError(ERROR_CODE.BAD_REQUEST, 'PDF exceeds the 10 MiB limit', 413);
  }

  const buf = Buffer.from(pdfBase64, 'base64');
  // Buffer.from silently drops invalid base64; an empty/near-empty result for a
  // non-trivial input means the string was not valid base64.
  if (buf.byteLength === 0) {
    throw new AppError(ERROR_CODE.BAD_REQUEST, 'pdfBase64 is not valid base64', 400);
  }
  if (buf.byteLength > MAX_PDF_BYTES) {
    throw new AppError(ERROR_CODE.BAD_REQUEST, 'PDF exceeds the 10 MiB limit', 413);
  }

  const bytes = new Uint8Array(buf);
  // `%PDF-` = 25 50 44 46 2D. Reject anything else up front.
  const header = [0x25, 0x50, 0x44, 0x46, 0x2d];
  const hasHeader = header.every((b, i) => bytes[i] === b);
  if (!hasHeader) {
    throw new AppError(ERROR_CODE.BAD_REQUEST, 'The file is not a PDF (missing %PDF- header)', 400);
  }
  return bytes;
}

/** Hex SHA-256 of bytes — the raw upload digest reported by /inspect. */
function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Stream PDF bytes back with the given disposition; copies into a clean ArrayBuffer. */
function pdfResponse(c: Context<IssuerHonoEnv>, bytes: Uint8Array, disposition: string): Response {
  const buf = bytes.slice().buffer;
  c.header('Content-Type', 'application/pdf');
  c.header('Content-Disposition', disposition);
  c.header('Content-Length', String(bytes.byteLength));
  c.header('Cache-Control', 'no-store');
  return c.body(buf);
}

export function registerUploadRoutes(app: Hono<IssuerHonoEnv>, deps: IssuerDeps): void {
  const api = new Hono<IssuerHonoEnv>();
  api.use('*', requireAdmin(deps));

  // Inspect — page count + each page's box + the raw digest. Side-effect-free.
  api.post('/inspect', async (c) => {
    const obj = asObject(await readJson(c), 'inspect');
    const bytes = decodePdf(requirePdfBase64(obj, 'inspect'));
    const originalSha256 = sha256Hex(bytes);
    let inspection;
    try {
      inspection = await inspectPdf(bytes);
    } catch (err) {
      if (err instanceof PdfInspectError) {
        throw new AppError(ERROR_CODE.BAD_REQUEST, 'The file is not a readable, unencrypted PDF', 400);
      }
      throw err;
    }
    return c.json({
      pageCount: inspection.pageCount,
      pages: inspection.pages,
      originalSha256,
    });
  });

  // Preview — stamp with the PLACEHOLDER id (+ optional signature). Side-effect-free.
  api.post('/preview', async (c) => {
    const obj = asObject(await readJson(c), 'preview');
    const bytes = decodePdf(requirePdfBase64(obj, 'preview'));
    const placement = parsePreviewPlacement(obj);

    // Defence in depth: confirm it parses as a PDF before stamping (stamp also
    // loads via pdf-lib, but inspect gives the uniform 400 mapping first).
    try {
      await inspectPdf(bytes);
    } catch (err) {
      if (err instanceof PdfInspectError) {
        throw new AppError(ERROR_CODE.BAD_REQUEST, 'The file is not a readable, unencrypted PDF', 400);
      }
      throw err;
    }

    let stamped: Uint8Array;
    try {
      stamped = await stampAttestation({
        pdfBytes: bytes,
        documentId: PREVIEW_UPLOAD_ID,
        verifyUrl: `${deps.env.VERIFY_PUBLIC_URL}/c/${PREVIEW_UPLOAD_ID}`,
        issueDateIso: new Date().toISOString().slice(0, 10),
        ...(placement !== undefined
          ? { signature: { pngBytes: SIGNATURE_PNG_BYTES, placement } }
          : {}),
      });
    } catch (err) {
      // A stamp failure on an already-inspected PDF is unexpected; surface a 400
      // rather than a 500 (the input was caller-supplied bytes).
      throw new AppError(ERROR_CODE.BAD_REQUEST, 'Could not stamp the uploaded PDF', 400, {
        cause: String(err),
      });
    }

    return pdfResponse(c, stamped, 'inline; filename="upload-preview.pdf"');
  });

  // Sign — the full attest pipeline. Returns the SIGNED PDF + X-Document-Id.
  api.post('/', async (c) => {
    const obj = asObject(await readJson(c), 'upload');
    // The PDF transport string is read + validated here; the attestation
    // metadata rides the shared `signUploadSchema` (which strips unknown keys
    // like `pdfBase64`, applies `placeHandwrittenSignature` default, and bounds
    // the placement + password).
    const pdfBase64 = requirePdfBase64(obj, 'upload');
    const parsed = signUploadSchema.safeParse(obj);
    if (!parsed.success) {
      throw new AppError(
        ERROR_CODE.VALIDATION_FAILED,
        'Invalid upload request',
        400,
        parsed.error.flatten(),
      );
    }
    const meta: SignUploadInput = parsed.data;
    const bytes = decodePdf(pdfBase64);

    // Validate it parses as a PDF (uniform 400) before the side-effecting pipeline.
    try {
      await inspectPdf(bytes);
    } catch (err) {
      if (err instanceof PdfInspectError) {
        throw new AppError(ERROR_CODE.BAD_REQUEST, 'The file is not a readable, unencrypted PDF', 400);
      }
      throw err;
    }

    const session = c.get('session');
    const { documentId, signedPdf } = await attestUpload(deps, meta, bytes, {
      requestId: c.get('requestId'),
      actor: session?.sub ?? 'admin',
    });

    c.header('X-Document-Id', documentId);
    return pdfResponse(c, signedPdf, `attachment; filename="${documentId}.pdf"`);
  });

  app.route('/api/uploads', api);
}
