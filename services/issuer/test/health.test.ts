import { describe, expect, it } from 'vitest';

import { createIssuerApp } from '../src/app.js';
import { buildDeps } from './fakes.js';

describe('issuer app — health', () => {
  it('responds ok on /health (shallow, no auth)', async () => {
    const app = createIssuerApp(buildDeps());
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok', service: 'issuer' });
  });

  it('responds ready on /health/ready when the data layer answers', async () => {
    const app = createIssuerApp(buildDeps());
    const res = await app.request('/health/ready');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: 'ready' });
  });
});
