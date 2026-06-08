/**
 * POST /api/credentials/preview — the exact, side-effect-free preview path.
 *
 * The preview route renders the REAL Chromium PDF for the same `CredentialContent`
 * issuance would render (so the embedded viewer is pixel-exact), but performs
 * ZERO side effects: no id allocation, signing, §63, log append, password hash,
 * persistence, anchoring, or audit. These tests pin that boundary:
 *   (a) it sits behind requireAdmin (401 without a session);
 *   (b) a valid body ⇒ 200 application/pdf with non-empty bytes + the right headers;
 *   (c) an invalid body ⇒ the uniform VALIDATION_FAILED 400;
 *   (e) spies confirm none of the §5.2 forbidden collaborators are touched.
 */

import { ERROR_CODE } from '@dmjone/shared';
import { describe, expect, it, vi } from 'vitest';

import { createIssuerApp } from '../src/app.js';
import { buildDeps } from './fakes.js';
import { mintSessionCookie } from './session-helper.js';

const PREVIEW_PATH = '/api/credentials/preview';
const PREVIEW_ID = 'DMJ-PRV-00000000-00';

/** A valid preview body — the issue body MINUS `password`. */
function previewBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'internship',
    recipientName: 'Asha Rao',
    kicker: 'Certificate of',
    title: 'INTERNSHIP',
    intro: 'This is to certify that',
    bodyParagraphs: [
      '[[align:center]]completed a **software engineering** internship at dmj.one.',
    ],
    closingLine: 'With our sincere appreciation.',
    issueDate: '2026-06-05',
    ...overrides,
  };
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

describe('POST /api/credentials/preview — auth gate', () => {
  it('rejects an unauthenticated preview with a uniform 401 (requireAdmin gates it)', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);

    const res = await app.request(PREVIEW_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(previewBody()),
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string; requestId: string };
    expect(body.code).toBe(ERROR_CODE.UNAUTHENTICATED);
    expect(body.requestId).toBeTruthy();
    // The gate fires BEFORE any work — not even a render happens.
    expect(deps.trace).toEqual([]);
  });
});

describe('POST /api/credentials/preview — happy path', () => {
  it('returns 200 application/pdf with non-empty bytes and the exact preview headers', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, PREVIEW_PATH, previewBody());

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('inline; filename="preview.pdf"');
    expect(res.headers.get('cache-control')).toBe('no-store');

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(0);
    // The fake renderer returns the 4-byte "unsg" sentinel; the route streams it verbatim.
    expect(res.headers.get('content-length')).toBe(String(bytes.byteLength));
  });

  it('renders with the placeholder id QR url (never a real/allocated id)', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    await authedPost(app, cookie, PREVIEW_PATH, previewBody());

    // The single observable effect is the render itself, with the placeholder QR.
    expect(deps.trace).toEqual(['render']);
    expect(deps.renderer.lastOpts?.qrUrl).toBe(
      `https://verify.example.test/c/${PREVIEW_ID}`,
    );
  });

  it('renders even without a closingLine (optional field omitted)', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const body = previewBody();
    delete body.closingLine;
    const res = await authedPost(app, cookie, PREVIEW_PATH, body);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });
});

describe('POST /api/credentials/preview — validation', () => {
  it('rejects an invalid body with the uniform VALIDATION_FAILED 400', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    // Empty bodyParagraphs violates `.min(1)`.
    const res = await authedPost(app, cookie, PREVIEW_PATH, previewBody({ bodyParagraphs: [] }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; error: string; requestId: string };
    expect(body.code).toBe(ERROR_CODE.VALIDATION_FAILED);
    expect(body.error).toBe('Invalid preview request');
    expect(body.requestId).toBeTruthy();
    // A rejected request renders nothing.
    expect(deps.trace).toEqual([]);
  });

  it('rejects a body missing a required field (e.g. title) with 400', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const body = previewBody();
    delete body.title;
    const res = await authedPost(app, cookie, PREVIEW_PATH, body);

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(ERROR_CODE.VALIDATION_FAILED);
  });

  it('accepts a body that still carries `password` (the schema OMITS it, never reads it)', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    // `.omit({ password: true })` strips unknown/extra keys by zod default; a
    // stray password must not break preview, and must NOT be hashed.
    const res = await authedPost(app, cookie, PREVIEW_PATH, {
      ...previewBody(),
      password: 'a-strong-password', // pragma: allowlist secret
    });

    expect(res.status).toBe(200);
    expect(deps.passwordHasher.hashed).toHaveLength(0);
  });
});

describe('POST /api/credentials/preview — strictly side-effect-free (§5.2)', () => {
  it('calls renderer.render but NONE of the forbidden collaborators', async () => {
    const deps = buildDeps();

    // Spy on every §5.2-forbidden side effect.
    const sign = vi.spyOn(deps.signer, 'sign');
    const s63meta = vi.spyOn(deps.section63, 'metadata');
    const s63generate = vi.spyOn(deps.section63, 'generate');
    const appendLeaf = vi.spyOn(deps.logRepo, 'appendLeaf');
    const hash = vi.spyOn(deps.passwordHasher, 'hash');
    const create = vi.spyOn(deps.credentialRepo, 'create');
    const put = vi.spyOn(deps.blobStore, 'put');
    const publish = vi.spyOn(deps.anchorPublisher, 'publish');
    const saveAnchor = vi.spyOn(deps.anchorRepo, 'save');
    const audit = vi.spyOn(deps.auditLog, 'append');
    // The one allowed effect.
    const render = vi.spyOn(deps.renderer, 'render');

    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, PREVIEW_PATH, previewBody());
    expect(res.status).toBe(200);

    // Exactly one render, nothing else.
    expect(render).toHaveBeenCalledTimes(1);
    expect(sign).not.toHaveBeenCalled();
    expect(s63meta).not.toHaveBeenCalled();
    expect(s63generate).not.toHaveBeenCalled();
    expect(appendLeaf).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(saveAnchor).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('writes nothing to the data layer (no record, no blob, no leaf, no audit, no anchor)', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    await authedPost(app, cookie, PREVIEW_PATH, previewBody());

    // No id was allocated/stored under the placeholder (or anything else).
    expect(deps.credentialRepo.createCount).toBe(0);
    expect(deps.credentialRepo.records.size).toBe(0);
    expect(await deps.credentialRepo.getById(PREVIEW_ID)).toBeNull();
    // No blobs persisted.
    expect(deps.blobStore.blobs.size).toBe(0);
    // The transparency log is untouched.
    expect(deps.logRepo.appendAttempts).toBe(0);
    expect(deps.logRepo.leaves).toHaveLength(0);
    // No audit event, no external anchor.
    expect(deps.auditLog.events).toHaveLength(0);
    expect(deps.anchorRepo.proofs).toHaveLength(0);
    // No password ever hashed.
    expect(deps.passwordHasher.hashed).toHaveLength(0);
  });

  it('two previews in a row allocate no ids and leave the data layer pristine', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const a = await authedPost(app, cookie, PREVIEW_PATH, previewBody());
    const b = await authedPost(app, cookie, PREVIEW_PATH, previewBody({ title: 'COMPLETION' }));

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // Idempotent + stateless: only renders happened, nothing accumulated.
    expect(deps.trace).toEqual(['render', 'render']);
    expect(deps.credentialRepo.records.size).toBe(0);
    expect(deps.blobStore.blobs.size).toBe(0);
  });
});
