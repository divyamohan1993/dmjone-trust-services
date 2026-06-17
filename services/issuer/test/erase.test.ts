/**
 * Credential erasure (DPDP §8(7)) — the admin endpoint, distinct from revoke.
 * Purges recipient PII from the record + the rendered blobs, keeps the crypto
 * residue (so the verify tombstone still proves the document existed), idempotent.
 */
import { describe, expect, it } from 'vitest';

import { createIssuerApp } from '../src/app.js';
import { buildDeps } from './fakes.js';
import { mintSessionCookie } from './session-helper.js';

function issueBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'internship',
    recipientName: 'Asha Rao',
    kicker: 'Certificate of',
    title: 'INTERNSHIP',
    intro: 'This is to certify that',
    bodyParagraphs: ['completed a software engineering internship at dmj.one.'],
    issueDate: '2026-06-05',
    attestation: true,
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

describe('credential erasure (DPDP §8(7))', () => {
  it('purges PII + both blobs, stamps erased, keeps crypto residue, is idempotent', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const issued = await authedPost(app, cookie, '/api/credentials', issueBody());
    const { credentialId } = (await issued.json()) as { credentialId: string };
    // Issue stored both blobs.
    expect(await deps.blobStore.get(credentialId, 'certificate')).not.toBeNull();

    const res = await authedPost(app, cookie, `/api/credentials/${credentialId}/erase`, {
      reason: 'data principal request',
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { erased: boolean }).erased).toBe(true);

    const rec = await deps.credentialRepo.getById(credentialId);
    expect(rec?.erased).toBe(true);
    expect((rec?.content as { recipientName: string }).recipientName).toBe('');
    expect(rec?.canonicalPayload).toBe('');
    // Non-PII crypto residue retained (the tombstone still proves existence).
    expect(rec?.mldsaSignature).toBeTruthy();
    expect(rec?.verifyToken).toBeTruthy();
    // Rendered blobs purged.
    expect(await deps.blobStore.get(credentialId, 'certificate')).toBeNull();
    expect(await deps.blobStore.get(credentialId, 'section63')).toBeNull();

    // Idempotent.
    const again = await authedPost(app, cookie, `/api/credentials/${credentialId}/erase`, {});
    expect(again.status).toBe(200);
  });

  it('requires admin auth', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const res = await app.request('/api/credentials/DMJ-IC-20260605-01/erase', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBeGreaterThanOrEqual(401);
  });

  it('404s on an unknown id', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);
    const res = await authedPost(app, cookie, '/api/credentials/DMJ-IC-20260101-99/erase', {});
    expect(res.status).toBe(404);
  });
});
