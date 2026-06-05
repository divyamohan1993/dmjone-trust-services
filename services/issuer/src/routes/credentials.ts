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
  issueCredentialSchema,
  revokeSchema,
} from '@dmjone/shared';
import type { CredentialRecord } from '@dmjone/shared';

import type { IssuerDeps } from '../deps.js';
import type { IssuerHonoEnv } from '../http/context.js';
import { requireAdmin } from '../http/middleware.js';
import { issueCredential } from '../issuance/issue.js';

/** Parse a JSON body, normalising any malformed JSON to a uniform 400. */
async function readJson(c: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError(ERROR_CODE.BAD_REQUEST, 'Request body must be valid JSON', 400);
  }
}

/** The public, list-safe projection of a stored record (no password hash, no payload). */
function toListItem(record: CredentialRecord): {
  credentialId: string;
  type: CredentialRecord['content']['type'];
  recipientName: string;
  status: CredentialRecord['status'];
  issueDate: string;
  createdAt: string;
  logSeq: number;
} {
  return {
    credentialId: record.id,
    type: record.content.type,
    recipientName: record.content.recipientName,
    status: record.status,
    issueDate: record.content.issueDate,
    createdAt: record.createdAt,
    logSeq: record.logSeq,
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
    await deps.credentialRepo.setStatus(credentialId, 'revoked', revokedAt);

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
