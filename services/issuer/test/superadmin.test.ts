import { describe, expect, it } from 'vitest';

import { createIssuerApp } from '../src/app.js';
import { TokenBucket } from '../src/superadmin/token-bucket.js';
import { buildDeps } from './fakes.js';
import { mintSessionCookie } from './session-helper.js';

describe('TokenBucket', () => {
  it('allows up to capacity then throttles', () => {
    const t0 = 1_000_000;
    const bucket = new TokenBucket({ capacity: 3, refillPerSecond: 1 }, t0);
    expect(bucket.take(t0)).toBe(true);
    expect(bucket.take(t0)).toBe(true);
    expect(bucket.take(t0)).toBe(true);
    expect(bucket.take(t0)).toBe(false); // exhausted
  });

  it('refills over time up to capacity', () => {
    const t0 = 1_000_000;
    const bucket = new TokenBucket({ capacity: 2, refillPerSecond: 1 }, t0);
    expect(bucket.take(t0)).toBe(true);
    expect(bucket.take(t0)).toBe(true);
    expect(bucket.take(t0)).toBe(false);
    // 1s later → one token back.
    expect(bucket.take(t0 + 1000)).toBe(true);
    expect(bucket.take(t0 + 1000)).toBe(false);
    // Long gap never exceeds capacity.
    expect(bucket.take(t0 + 60_000)).toBe(true);
    expect(bucket.take(t0 + 60_000)).toBe(true);
    expect(bucket.take(t0 + 60_000)).toBe(false);
  });
});

function post(
  app: ReturnType<typeof createIssuerApp>,
  path: string,
  body: unknown,
  cookie?: string,
): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body ?? {}),
  });
}

describe('super-admin auth gate + factory reset', () => {
  it('401s the DR snapshot without a session', async () => {
    const app = createIssuerApp(buildDeps());
    const res = await post(app, '/super-admin/dr/snapshot', {});
    expect(res.status).toBe(401);
  });

  it('produces a DR snapshot with a session and audits it', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);
    const res = await post(app, '/super-admin/dr/snapshot', {}, cookie);
    expect(res.status).toBe(200);
    expect((await res.json()) as { auditIntact: boolean }).toHaveProperty('auditIntact');
    expect(deps.auditLog.events.some((e) => e.action === 'superadmin.dr.snapshot')).toBe(true);
  });

  it('rejects factory reset with a wrong confirmation phrase (403) and does not wipe', async () => {
    const deps = buildDeps();
    deps.adminRepo.account = {
      id: 'admin',
      webauthnCredentials: [
        { credentialId: 'c', publicKey: 'k', counter: 1, label: 'l', createdAt: 'now' },
      ],
      recoveryCodeHashes: [],
      failureCount: 0,
      createdAt: 'now',
      updatedAt: 'now',
    };
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);
    const res = await post(app, '/super-admin/factory-reset', { phrase: 'nope' }, cookie);
    expect(res.status).toBe(403);
    // Account untouched.
    expect(deps.adminRepo.account?.webauthnCredentials).toHaveLength(1);
    expect(deps.auditLog.events.some((e) => e.action === 'superadmin.factory_reset.denied')).toBe(
      true,
    );
  });

  it('performs factory reset with the exact phrase (clears the admin account)', async () => {
    const deps = buildDeps();
    deps.adminRepo.account = {
      id: 'admin',
      webauthnCredentials: [
        { credentialId: 'c', publicKey: 'k', counter: 1, label: 'l', createdAt: 'now' },
      ],
      recoveryCodeHashes: ['h1'],
      failureCount: 0,
      createdAt: 'now',
      updatedAt: 'now',
    };
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);
    const res = await post(
      app,
      '/super-admin/factory-reset',
      { phrase: 'RESET dmj.one Trust Services' },
      cookie,
    );
    expect(res.status).toBe(200);
    expect(deps.adminRepo.account?.webauthnCredentials).toHaveLength(0);
    expect(deps.adminRepo.account?.recoveryCodeHashes).toHaveLength(0);
    expect(deps.auditLog.events.some((e) => e.action === 'superadmin.factory_reset.begin')).toBe(
      true,
    );
  });

  it('early-rejects with a static 429 once the burst is exhausted (before auth)', async () => {
    const app = createIssuerApp(buildDeps());
    // Bucket capacity is 20; fire enough unauthenticated requests to exhaust it.
    let saw429 = false;
    let body429 = '';
    for (let i = 0; i < 40; i += 1) {
      const res = await app.request('/super-admin/', { method: 'GET' });
      if (res.status === 429) {
        saw429 = true;
        body429 = await res.text();
        break;
      }
    }
    expect(saw429).toBe(true);
    // Tiny static body, no JSON funnel, no secrets.
    expect(body429).toBe('Too Many Requests');
  });
});
