import { CREDENTIAL_ID_REGEX, ERROR_CODE, AppError } from '@dmjone/shared';
import { describe, expect, it } from 'vitest';

import { createIssuerApp } from '../src/app.js';
import { buildDeps } from './fakes.js';
import { mintSessionCookie } from './session-helper.js';

/** A valid issuance body. */
function issueBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'internship',
    recipientName: 'Asha Rao',
    kicker: 'Certificate of',
    title: 'INTERNSHIP',
    intro: 'This is to certify that',
    bodyParagraphs: ['completed a software engineering internship at dmj.one.'],
    issueDate: '2026-06-05',
    password: 'a-strong-password', // pragma: allowlist secret
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

describe('POST /api/credentials — issuance happy path', () => {
  it('runs the pipeline in order and returns a well-formed id', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, '/api/credentials', issueBody());

    expect(res.status).toBe(201);
    const json = (await res.json()) as { credentialId: string };
    expect(json.credentialId).toMatch(CREDENTIAL_ID_REGEX);
    // internship → IC, issueDate 2026-06-05 → 20260605, first of day → 01
    expect(json.credentialId).toBe('DMJ-IC-20260605-01');

    // The externally observable pipeline order (spec §5).
    expect(deps.trace).toEqual([
      'render',
      'sign',
      's63meta',
      'logAppend',
      'put:certificate',
      's63generate',
      'put:section63',
      'audit',
    ]);
  });

  it('persists a complete record and both blobs', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    await authedPost(app, cookie, '/api/credentials', issueBody());

    const record = await deps.credentialRepo.getById('DMJ-IC-20260605-01');
    expect(record).not.toBeNull();
    expect(record?.status).toBe('valid');
    expect(record?.passwordHash).toBe('$argon2id$fake$a-strong-password');
    expect(record?.logSeq).toBe(1);
    expect(record?.mldsaSignature).toBe('c2lnbmF0dXJl');
    expect(record?.section63.hashValue).toBe('a'.repeat(64));

    // Both PDFs stored at issue-time (verify service only ever serves stored bytes).
    expect(await deps.blobStore.get('DMJ-IC-20260605-01', 'certificate')).not.toBeNull();
    expect(await deps.blobStore.get('DMJ-IC-20260605-01', 'section63')).not.toBeNull();

    // QR points at the public verify credential page.
    expect(deps.renderer.lastOpts?.qrUrl).toBe(
      'https://verify.example.test/c/DMJ-IC-20260605-01',
    );
  });

  it('does not let a failed external anchor block issuance', async () => {
    const deps = buildDeps();
    deps.anchorPublisher.shouldFail = true;
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, '/api/credentials', issueBody());

    expect(res.status).toBe(201);
    expect(deps.anchorRepo.proofs).toHaveLength(0); // anchor failed, but credential persisted
    expect(await deps.credentialRepo.getById('DMJ-IC-20260605-01')).not.toBeNull();
  });

  it('allocates the next per-day sequence when 01 is taken', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const first = await authedPost(app, cookie, '/api/credentials', issueBody());
    const second = await authedPost(app, cookie, '/api/credentials', issueBody());

    expect(((await first.json()) as { credentialId: string }).credentialId).toBe(
      'DMJ-IC-20260605-01',
    );
    expect(((await second.json()) as { credentialId: string }).credentialId).toBe(
      'DMJ-IC-20260605-02',
    );
  });
});

describe('POST /api/credentials — transparency-log retry', () => {
  it('retries the append once on LOG_CONFLICT then succeeds', async () => {
    const deps = buildDeps({
      logConflicts: 1,
      conflictError: () => new AppError(ERROR_CODE.LOG_CONFLICT, 'head moved', 409),
    });
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, '/api/credentials', issueBody());

    expect(res.status).toBe(201);
    expect(deps.logRepo.appendAttempts).toBe(2); // one conflict + one success
    expect(deps.logRepo.leaves).toHaveLength(1);
    expect(await deps.credentialRepo.getById('DMJ-IC-20260605-01')).not.toBeNull();
  });

  it('surfaces a non-conflict append error as a failure (no record written)', async () => {
    const deps = buildDeps({
      logConflicts: 1,
      conflictError: () => new AppError(ERROR_CODE.LOG_APPEND_FAILED, 'disk on fire', 500),
    });
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, '/api/credentials', issueBody());

    expect(res.status).toBe(500);
    expect(deps.logRepo.appendAttempts).toBe(1); // not retried
    expect(deps.credentialRepo.createCount).toBe(0); // failed before persisting
  });
});

describe('POST /api/credentials — auth + validation', () => {
  it('rejects unauthenticated issuance with a uniform 401', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);

    const res = await app.request('/api/credentials', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(issueBody()),
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string; requestId: string; error: string };
    expect(body.code).toBe(ERROR_CODE.UNAUTHENTICATED);
    expect(body.requestId).toBeTruthy();
    // Nothing happened on the data layer.
    expect(deps.credentialRepo.createCount).toBe(0);
    expect(deps.trace).toEqual([]);
  });

  it('rejects an invalid body with VALIDATION_FAILED (400)', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, '/api/credentials', issueBody({ password: 'short' }));

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(ERROR_CODE.VALIDATION_FAILED);
    expect(deps.credentialRepo.createCount).toBe(0);
  });
});

describe('POST /api/credentials/:id/revoke', () => {
  it('flips status to revoked and audits it', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    await authedPost(app, cookie, '/api/credentials', issueBody());
    const res = await authedPost(
      app,
      cookie,
      '/api/credentials/DMJ-IC-20260605-01/revoke',
      { reason: 'issued in error' },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; revokedAt: string };
    expect(body.status).toBe('revoked');
    expect(body.revokedAt).toBeTruthy();

    const record = await deps.credentialRepo.getById('DMJ-IC-20260605-01');
    expect(record?.status).toBe('revoked');
    expect(record?.revokedAt).toBeTruthy();

    expect(deps.auditLog.events.some((e) => e.action === 'credential.revoke')).toBe(true);
  });

  it('404s revoking an unknown credential', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(
      app,
      cookie,
      '/api/credentials/DMJ-IC-20260605-99/revoke',
      {},
    );

    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe(ERROR_CODE.CREDENTIAL_NOT_FOUND);
  });

  it('requires authentication to revoke', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);

    const res = await app.request('/api/credentials/DMJ-IC-20260605-01/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    expect(res.status).toBe(401);
  });
});
