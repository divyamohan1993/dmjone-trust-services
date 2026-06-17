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
    attestation: true, // required issuer attestation (literal `true`)
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

describe('signed status assertions (WS3)', () => {
  it('issue stamps a valid status assertion bound to createdAt', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, '/api/credentials', issueBody());
    const { credentialId } = (await res.json()) as { credentialId: string };

    const record = await deps.credentialRepo.getById(credentialId);
    expect(record?.status).toBe('valid');
    expect(record?.statusSignature).toBeDefined();
    expect(record?.statusSignature?.asOf).toBe(record?.createdAt);
    // FakeStatusSigner is deterministic: status-sig:<id>:<status>:<asOf>.
    expect(record?.statusSignature?.value).toBe(
      `status-sig:${credentialId}:valid:${record?.createdAt}`,
    );
  });

  it('revoke re-mints the assertion (revoked, asOf=revokedAt) and re-renders the §63', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const issued = await authedPost(app, cookie, '/api/credentials', issueBody());
    const { credentialId } = (await issued.json()) as { credentialId: string };

    const res = await authedPost(app, cookie, `/api/credentials/${credentialId}/revoke`, {});
    expect(res.status).toBe(200);
    const { revokedAt } = (await res.json()) as { revokedAt: string };

    const record = await deps.credentialRepo.getById(credentialId);
    expect(record?.status).toBe('revoked');
    expect(record?.revokedAt).toBe(revokedAt);
    expect(record?.statusSignature?.asOf).toBe(revokedAt);
    expect(record?.statusSignature?.value).toBe(
      `status-sig:${credentialId}:revoked:${revokedAt}`,
    );

    // Best-effort §63 re-render on revoke: a SECOND generate + store happened
    // (once at issue, once on revoke) so the downloadable §63 reflects "Revoked".
    expect(deps.trace.filter((t) => t === 's63generate')).toHaveLength(2);
    expect(deps.trace.filter((t) => t === 'put:section63')).toHaveLength(2);
  });

  it('revocation still succeeds even if the §63 re-render throws (non-fatal)', async () => {
    const deps = buildDeps();
    // Arm the §63 generator to throw on the revoke-time re-render.
    let calls = 0;
    const realGenerate = deps.section63.generate.bind(deps.section63);
    deps.section63.generate = async (record) => {
      calls += 1;
      if (calls >= 2) throw new Error('chromium exploded');
      return realGenerate(record);
    };
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const issued = await authedPost(app, cookie, '/api/credentials', issueBody());
    const { credentialId } = (await issued.json()) as { credentialId: string };

    const res = await authedPost(app, cookie, `/api/credentials/${credentialId}/revoke`, {});
    // The revocation takes legal effect regardless of the re-render failure.
    expect(res.status).toBe(200);
    const record = await deps.credentialRepo.getById(credentialId);
    expect(record?.status).toBe('revoked');
    expect(record?.statusSignature?.value).toBe(
      `status-sig:${credentialId}:revoked:${record?.revokedAt}`,
    );
  });
});
