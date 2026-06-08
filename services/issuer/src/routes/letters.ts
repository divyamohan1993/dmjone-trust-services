/**
 * Authenticated letterhead-letter API (Mode 2): issue + exact preview.
 *
 * Both routes sit behind {@link requireAdmin}; bodies are validated with the
 * shared `issueLetterSchema` at the boundary. Errors are thrown as
 * {@link AppError} and rendered uniformly by the error funnel.
 *
 *   POST /api/letters          → run the letter issuance pipeline; { documentId }, 201
 *   POST /api/letters/preview  → side-effect-free exact letter render (PDF bytes)
 *
 * The preview mirrors the certificate preview route exactly (same Content-Type,
 * Content-Disposition, no-store, ArrayBuffer body idiom) and is strictly
 * side-effect-free: validate → assembleLetterContent(placeholder id) →
 * renderer.renderLetter → return PDF bytes. No id allocation, signing, §63, log
 * append, password hash, persistence, anchoring, or audit.
 */

import { Hono } from 'hono';

import { AppError, ERROR_CODE, issueLetterSchema } from '@dmjone/shared';

import type { IssuerDeps } from '../deps.js';
import type { IssuerHonoEnv } from '../http/context.js';
import { requireAdmin } from '../http/middleware.js';
import { assembleLetterContent } from '../issuance/assemble-letter-content.js';
import { issueLetter } from '../issuance/issue-letter.js';

/**
 * Fixed display-only id for the exact letter preview render. Satisfies
 * {@link CREDENTIAL_ID_REGEX} (`LTR` is 3 letters); never allocated, never
 * stored. The preview path is strictly side-effect-free.
 */
const PREVIEW_LETTER_ID = 'DMJ-LTR-00000000-00';

/** Parse a JSON body, normalising any malformed JSON to a uniform 400. */
async function readJson(c: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError(ERROR_CODE.BAD_REQUEST, 'Request body must be valid JSON', 400);
  }
}

export function registerLetterRoutes(app: Hono<IssuerHonoEnv>, deps: IssuerDeps): void {
  const api = new Hono<IssuerHonoEnv>();
  api.use('*', requireAdmin(deps));

  // Issue a new letterhead letter.
  api.post('/', async (c) => {
    const parsed = issueLetterSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      throw new AppError(
        ERROR_CODE.VALIDATION_FAILED,
        'Invalid letter request',
        400,
        parsed.error.flatten(),
      );
    }
    const session = c.get('session');
    const { documentId } = await issueLetter(deps, parsed.data, {
      requestId: c.get('requestId'),
      actor: session?.sub ?? 'admin',
    });
    return c.json({ documentId }, 201);
  });

  // Exact preview — the real Chromium PDF for the SAME content issuance renders,
  // with NO side effects. Same body as issue minus `password`.
  api.post('/preview', async (c) => {
    const previewSchema = issueLetterSchema.omit({ password: true });
    const parsed = previewSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      throw new AppError(
        ERROR_CODE.VALIDATION_FAILED,
        'Invalid preview request',
        400,
        parsed.error.flatten(),
      );
    }

    // assembleLetterContent takes the letter fields WITHOUT `password` (a password
    // is not letter content), so the password-less preview payload feeds it directly.
    const content = assembleLetterContent(parsed.data, PREVIEW_LETTER_ID);
    const qrUrl = `${deps.env.VERIFY_PUBLIC_URL}/c/${PREVIEW_LETTER_ID}`;
    const pdfBytes = await deps.renderer.renderLetter(content, { qrUrl });

    // Copy into a fresh ArrayBuffer so the BodyInit is a clean ArrayBuffer slice.
    const buf = pdfBytes.slice().buffer;
    c.header('Content-Type', 'application/pdf');
    c.header('Content-Disposition', 'inline; filename="letter-preview.pdf"');
    c.header('Content-Length', String(pdfBytes.byteLength));
    c.header('Cache-Control', 'no-store');
    return c.body(buf);
  });

  app.route('/api/letters', api);
}
