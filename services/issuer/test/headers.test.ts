import { describe, it, expect } from 'vitest';
import { createIssuerApp } from '../src/app.js';
import { buildDeps } from './fakes.js';
describe('headers', () => {
  it('sets security headers on success + error', async () => {
    const app = createIssuerApp(buildDeps());
    const ok = await app.request('/health');
    expect(ok.headers.get('content-security-policy')).toContain("nonce-");
    expect(ok.headers.get('x-frame-options')).toBe('DENY');
    expect(ok.headers.get('strict-transport-security')).toContain('max-age');
    expect(ok.headers.get('x-request-id')).toBeTruthy();
    const err = await app.request('/api/credentials', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
    expect(err.status).toBe(401);
    expect(err.headers.get('x-frame-options')).toBe('DENY');
    expect(err.headers.get('content-security-policy')).toContain('default-src');
    expect(err.headers.get('x-request-id')).toBeTruthy();
  });
});
