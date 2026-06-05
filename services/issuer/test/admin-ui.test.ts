import { describe, expect, it } from 'vitest';

import { createIssuerApp } from '../src/app.js';
import { buildDeps } from './fakes.js';
import { mintSessionCookie } from './session-helper.js';

describe('GET /admin (server-rendered, no CDN)', () => {
  it('renders the first-time setup view when unprovisioned + unauthenticated', async () => {
    const app = createIssuerApp(buildDeps());
    const res = await app.request('/admin');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('First-time setup');
    expect(body).toContain('data-action="register"');
    // No third-party origins: the only script is inline + nonce'd.
    expect(body).not.toContain('http://');
    expect(body).not.toMatch(/src=["']https?:\/\//);
    // Inline script carries the per-request CSP nonce.
    const csp = res.headers.get('content-security-policy') ?? '';
    const nonceMatch = csp.match(/'nonce-([a-f0-9]+)'/);
    expect(nonceMatch).not.toBeNull();
    expect(body).toContain(`<script nonce="${nonceMatch?.[1]}">`);
  });

  it('renders the login view when provisioned + unauthenticated', async () => {
    const deps = buildDeps();
    deps.adminRepo.account = {
      id: 'admin',
      webauthnCredentials: [
        { credentialId: 'c', publicKey: 'k', counter: 0, label: 'l', createdAt: 'now' },
      ],
      recoveryCodeHashes: [],
      failureCount: 0,
      createdAt: 'now',
      updatedAt: 'now',
    };
    const app = createIssuerApp(deps);
    const body = await (await app.request('/admin')).text();
    expect(body).toContain('Administrator sign-in');
    expect(body).toContain('data-action="login"');
    expect(body).toContain('data-action="recover"');
  });

  it('renders the issuance dashboard when authenticated', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);
    const res = await app.request('/admin', { headers: { cookie } });
    const body = await res.text();
    expect(body).toContain('Issue a certificate');
    expect(body).toContain('id="issue-form"');
    expect(body).toContain('Issued credentials');
    // The recipient-name input the issuance form posts.
    expect(body).toContain('name="recipientName"');
  });
});
