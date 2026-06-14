/**
 * Authenticated credential API: issue, revoke, list.
 *
 * Every route sits behind {@link requireAdmin}. Bodies are validated with the
 * shared zod schemas at the boundary (all input hostile until parsed). Errors
 * are thrown as {@link AppError} and rendered uniformly by the error funnel.
 */

import { Hono } from 'hono';

import {
  AppError,
  ERROR_CODE,
  credentialIdParamSchema,
  documentKind,
  issueCredentialSchema,
  revokeSchema,
} from '@dmjone/shared';
import type {
  CredentialContent,
  CredentialRecord,
  CredentialType,
  DocumentKind,
  LetterContent,
  UploadAttestation,
} from '@dmjone/shared';

import type { IssuerDeps } from '../deps.js';
import type { IssuerHonoEnv } from '../http/context.js';
import { requireAdmin } from '../http/middleware.js';
import { assembleContent } from '../issuance/assemble-content.js';
import { issueCredential } from '../issuance/issue.js';
import { mintStatusSignature } from '../issuance/sign-status.js';

/**
 * Fixed display-only id for the exact-preview render. Satisfies
 * {@link CREDENTIAL_ID_REGEX} (`PRV` is 3 letters); never allocated, never
 * stored. The preview path is strictly side-effect-free.
 */
const PREVIEW_CREDENTIAL_ID = 'DMJ-PRV-00000000-00';

/** Parse a JSON body, normalising any malformed JSON to a uniform 400. */
async function readJson(c: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError(ERROR_CODE.BAD_REQUEST, 'Request body must be valid JSON', 400);
  }
}

/**
 * The public, list-safe projection of a stored record (no password hash, no
 * payload). Kind-aware (§D): every kind yields the shared identity columns
 * (`credentialId`, `kind`, `status`, `issueDate`, `createdAt`, `logSeq`) plus a
 * human `label` for the dashboard row:
 *   - certificate → the recipient name (and the `type`/`recipientName` columns
 *     stay, so existing cert consumers read unchanged);
 *   - letter      → the subject, else the first recipient line, else "Letter";
 *   - upload      → the original filename.
 * The cert-only `type`/`recipientName` keys are present ONLY for certificates.
 */
interface ListItem {
  credentialId: string;
  kind: DocumentKind;
  label: string;
  status: CredentialRecord['status'];
  issueDate: string;
  createdAt: string;
  logSeq: number;
  /** Certificate only: the preset/custom type. */
  type?: CredentialType;
  /** Certificate only: the recipient name. */
  recipientName?: string;
}

function toListItem(record: CredentialRecord): ListItem {
  const kind = documentKind(record);
  const base = {
    credentialId: record.id,
    kind,
    status: record.status,
    createdAt: record.createdAt,
    logSeq: record.logSeq,
  };

  if (kind === 'letter') {
    const c = record.content as LetterContent;
    const label = c.subject || c.recipientLines.find((l) => l.trim().length > 0) || 'Letter';
    return { ...base, label, issueDate: c.issueDate };
  }
  if (kind === 'upload') {
    const c = record.content as UploadAttestation;
    return { ...base, label: c.originalFilename, issueDate: c.issueDate };
  }
  // certificate (kind absent or 'certificate')
  const c = record.content as CredentialContent;
  return {
    ...base,
    label: c.recipientName,
    type: c.type,
    recipientName: c.recipientName,
    issueDate: c.issueDate,
  };
}

export function registerCredentialRoutes(app: Hono<IssuerHonoEnv>, deps: IssuerDeps): void {
  const api = new Hono<IssuerHonoEnv>();
  api.use('*', requireAdmin(deps));

  // Issue a new credential.
  api.post('/', async (c) => {
    const parsed = issueCredentialSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      throw new AppError(
        ERROR_CODE.VALIDATION_FAILED,
        'Invalid credential request',
        400,
        parsed.error.flatten(),
      );
    }
    const session = c.get('session');
    const { credentialId } = await issueCredential(deps, parsed.data, {
      requestId: c.get('requestId'),
      actor: session?.sub ?? 'admin',
    });
    return c.json({ credentialId }, 201);
  });

  // Exact preview — the real Chromium PDF for the SAME content issuance renders,
  // with NO side effects (no allocation, signing, persistence, anchoring, or
  // audit). Same body as issue minus `password`. Strictly: validate →
  // assembleContent(placeholder id) → renderer.render → return PDF bytes.
  api.post('/preview', async (c) => {
    const previewSchema = issueCredentialSchema.omit({ password: true });
    const parsed = previewSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      throw new AppError(
        ERROR_CODE.VALIDATION_FAILED,
        'Invalid preview request',
        400,
        parsed.error.flatten(),
      );
    }

    const content = assembleContent(parsed.data, PREVIEW_CREDENTIAL_ID);
    const qrUrl = `${deps.env.VERIFY_PUBLIC_URL}/c/${PREVIEW_CREDENTIAL_ID}`;
    const pdfBytes = await deps.renderer.render(content, { qrUrl });

    // Copy into a fresh ArrayBuffer so the BodyInit is a clean ArrayBuffer slice.
    const buf = pdfBytes.slice().buffer;
    c.header('Content-Type', 'application/pdf');
    c.header('Content-Disposition', 'inline; filename="preview.pdf"');
    c.header('Content-Length', String(pdfBytes.byteLength));
    c.header('Cache-Control', 'no-store');
    return c.body(buf);
  });

  // List credentials (newest-first projection; no secrets).
  api.get('/', async (c) => {
    const limitRaw = c.req.query('limit');
    const cursor = c.req.query('cursor');
    const limit = limitRaw ? Math.min(Math.max(Number(limitRaw) || 0, 1), 100) : undefined;
    const page = await deps.credentialRepo.list({
      ...(limit !== undefined && { limit }),
      ...(cursor !== undefined && { cursor }),
    });
    return c.json({
      items: page.items.map(toListItem),
      ...(page.nextCursor !== undefined && { nextCursor: page.nextCursor }),
    });
  });

  // Revoke a credential.
  api.post('/:credentialId/revoke', async (c) => {
    const idParse = credentialIdParamSchema.safeParse({ credentialId: c.req.param('credentialId') });
    if (!idParse.success) {
      throw new AppError(ERROR_CODE.BAD_REQUEST, 'Malformed credential id', 400);
    }
    const body = (await readJson(c)) ?? {};
    const bodyParse = revokeSchema.safeParse({
      credentialId: idParse.data.credentialId,
      ...(typeof body === 'object' && body !== null ? body : {}),
    });
    if (!bodyParse.success) {
      throw new AppError(
        ERROR_CODE.VALIDATION_FAILED,
        'Invalid revoke request',
        400,
        bodyParse.error.flatten(),
      );
    }
    const { credentialId, reason } = bodyParse.data;

    const existing = await deps.credentialRepo.getById(credentialId);
    if (!existing) {
      throw new AppError(ERROR_CODE.CREDENTIAL_NOT_FOUND, 'No such credential', 404);
    }

    const revokedAt = new Date().toISOString();
    // The status flip + its signed assertion ARE the revocation: pure compute,
    // safe to be fatal. (Persisting an unsigned revocation would be unprovable.)
    const statusSignature = mintStatusSignature(deps.statusSigner, credentialId, 'revoked', revokedAt);
    await deps.credentialRepo.setStatus(credentialId, 'revoked', revokedAt, statusSignature);

    // Best-effort: re-render the §63 so the downloadable certificate shows
    // "Revoked" (the live verify page already does, from record.status). A
    // Chromium failure here must NEVER block a revocation taking legal effect.
    try {
      const updated = await deps.credentialRepo.getById(credentialId);
      if (updated) {
        const s63pdf = await deps.section63.generate(updated);
        await deps.blobStore.put(credentialId, 'section63', s63pdf);
      }
    } catch (err) {
      deps.logger.error(
        { err, credentialId, requestId: c.get('requestId') },
        'section63 re-render on revoke failed (non-fatal); revocation stands and the verify page reflects it',
      );
    }

    const session = c.get('session');
    await deps.auditLog.append({
      actor: 'admin',
      action: 'credential.revoke',
      subject: credentialId,
      requestId: c.get('requestId'),
      meta: { by: session?.sub ?? 'admin', ...(reason !== undefined && { reason }) },
    });

    return c.json({ credentialId, status: 'revoked', revokedAt });
  });

  app.route('/api/credentials', api);
}
