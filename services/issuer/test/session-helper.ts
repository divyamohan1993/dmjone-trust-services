/**
 * Test helper: forge a valid admin session cookie without driving the full
 * WebAuthn ceremony.
 *
 * Rather than reimplement Hono's signed-cookie HMAC, we run a throwaway one-shot
 * Hono route that calls the *real* {@link issueSession}, capture the resulting
 * `Set-Cookie`, and reduce it to a `Cookie` header value. Replaying that header
 * against the app under test produces a genuinely authenticated request — the
 * same path production uses — so the issuance/revoke tests exercise the real
 * session gate, not a mock of it.
 */

import { Hono } from 'hono';

import type { AppEnv } from '@dmjone/shared';

import { issueSession } from '../src/auth/session.js';

export async function mintSessionCookie(
  env: AppEnv,
  principal: { sub: string; via: 'passkey' | 'recovery' } = { sub: 'admin', via: 'passkey' },
): Promise<string> {
  const app = new Hono();
  app.get('/__mint', async (c) => {
    await issueSession(c, env, principal);
    return c.body(null, 204);
  });
  const res = await app.request('/__mint');
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error('session helper: no Set-Cookie produced');
  // Reduce "name=value; Path=/; HttpOnly; ..." to the bare "name=value" pair
  // the browser would echo back in the Cookie request header.
  const pair = setCookie.split(';', 1)[0];
  if (!pair) throw new Error('session helper: malformed Set-Cookie');
  return pair;
}
