/**
 * Admin session: a tamper-proof, short-lived httpOnly cookie.
 *
 * The session payload is JSON-serialised and stored inside a Hono *signed*
 * cookie (HMAC-SHA256 over `SESSION_SECRET`), so the client cannot forge or
 * mutate it. We additionally embed an absolute `exp` and re-check it on read,
 * so an expired-but-still-present cookie is rejected even if the browser kept
 * sending it. This module is deliberately standalone — login handlers mint a
 * session through {@link issueSession}; the gate reads it through
 * {@link readSession} — so the issuance path can be exercised in tests without
 * driving the full WebAuthn ceremony.
 */

import type { Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';

import type { AppEnv } from '@dmjone/shared';

export const SESSION_COOKIE = '__Host-dmj_admin';

/** The authenticated principal carried by a session. */
export interface AdminSession {
  /** Admin account id. */
  sub: string;
  /** How the session was established (audit/telemetry only). */
  via: 'passkey' | 'recovery';
  /** Issued-at, epoch seconds. */
  iat: number;
  /** Absolute expiry, epoch seconds. */
  exp: number;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Cookie attributes shared by set + delete so they always match. */
function cookieOptions(env: AppEnv, maxAgeSeconds?: number): {
  path: '/';
  httpOnly: true;
  secure: true;
  sameSite: 'Strict';
  maxAge?: number;
} {
  // `__Host-` prefix mandates Secure + Path=/ + no Domain. In tests over plain
  // HTTP the prefix is irrelevant to our own verification (we never parse it),
  // and Hono still sets the cookie; production is always HTTPS behind CF.
  void env;
  return {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    ...(maxAgeSeconds !== undefined && { maxAge: maxAgeSeconds }),
  };
}

/** Mint a fresh session cookie. TTL from `ADMIN_SESSION_TTL_SECONDS`. */
export async function issueSession(
  c: Context,
  env: AppEnv,
  principal: { sub: string; via: AdminSession['via'] },
): Promise<AdminSession> {
  const ttl = env.ADMIN_SESSION_TTL_SECONDS;
  const iat = nowSeconds();
  const session: AdminSession = { sub: principal.sub, via: principal.via, iat, exp: iat + ttl };
  await setSignedCookie(
    c,
    SESSION_COOKIE,
    JSON.stringify(session),
    env.SESSION_SECRET,
    cookieOptions(env, ttl),
  );
  return session;
}

/**
 * Read + validate the session from the request. Returns null when the cookie is
 * absent, the signature is invalid/forged, the JSON is malformed, or it has
 * expired. Never throws.
 */
export async function readSession(c: Context, env: AppEnv): Promise<AdminSession | null> {
  let raw: string | false | undefined;
  try {
    raw = await getSignedCookie(c, env.SESSION_SECRET, SESSION_COOKIE);
  } catch {
    return null;
  }
  if (raw === false || raw === undefined) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isAdminSession(parsed)) return null;
  if (parsed.exp <= nowSeconds()) return null;
  return parsed;
}

/** Clear the session cookie (logout / session invalidation). */
export function clearSession(c: Context, env: AppEnv): void {
  deleteCookie(c, SESSION_COOKIE, cookieOptions(env));
}

function isAdminSession(v: unknown): v is AdminSession {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.sub === 'string' &&
    (o.via === 'passkey' || o.via === 'recovery') &&
    typeof o.iat === 'number' &&
    typeof o.exp === 'number'
  );
}
