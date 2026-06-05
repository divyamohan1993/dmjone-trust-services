import { Secret, TOTP } from 'otpauth';
import { describe, expect, it } from 'vitest';

import {
  MAX_BACKOFF_MS,
  backoffMs,
  evaluateLock,
  recordFailure,
  recordSuccess,
} from '../src/auth/lockout.js';
import {
  consumeRecoveryCode,
  generateRecoveryCode,
  generateRecoveryCodes,
  normalizeCode,
} from '../src/auth/recovery.js';
import { enrollTotp, verifyTotp } from '../src/auth/totp.js';
import {
  emptyAdmin,
  evaluateRegistration,
  isProvisioned,
  mayRegister,
} from '../src/auth/admin-store.js';
import { FakePasswordHasher, FakeSecretSealer, makeTestEnv } from './fakes.js';

/** A provisioned account (≥1 passkey) for gate tests. */
function provisioned(): ReturnType<typeof emptyAdmin> {
  return {
    ...emptyAdmin('2026-06-05T00:00:00.000Z'),
    webauthnCredentials: [
      { credentialId: 'c', publicKey: 'k', counter: 0, label: 'l', createdAt: 'now' },
    ],
  };
}

describe('lockout.backoffMs', () => {
  it('is 0 for no failures and grows exponentially, capped at 1h', () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(1)).toBe(1000); // 2^0 s
    expect(backoffMs(2)).toBe(2000);
    expect(backoffMs(3)).toBe(4000);
    expect(backoffMs(12)).toBe(2 ** 11 * 1000); // 2048s, still under the 1h cap
    expect(backoffMs(13)).toBe(MAX_BACKOFF_MS); // 2^12 s = 4096s → clamped to 1h
    expect(backoffMs(50)).toBe(MAX_BACKOFF_MS); // clamp holds for large counts
  });
});

describe('lockout.evaluateLock (recovery+TOTP path)', () => {
  const base = emptyAdmin('2026-06-05T00:00:00.000Z');

  it('is unlocked with zero failures', () => {
    expect(evaluateLock(base, 10, Date.now())).toEqual({ locked: false });
  });

  it('is permanently locked at or beyond MAX_AUTH_FAILURES', () => {
    const locked = { ...base, failureCount: 10 };
    expect(evaluateLock(locked, 10, Date.now())).toEqual({ locked: true, permanent: true });
  });

  it('is temporarily locked while lockedUntil is in the future', () => {
    const now = Date.UTC(2026, 5, 5, 12, 0, 0);
    const acc = { ...base, failureCount: 2, lockedUntil: new Date(now + 5000).toISOString() };
    const state = evaluateLock(acc, 10, now);
    expect(state.locked).toBe(true);
    if (state.locked && !state.permanent) expect(state.retryAfterMs).toBe(5000);
  });

  it('recordFailure bumps count + sets lockedUntil; recordSuccess clears both', () => {
    const now = Date.UTC(2026, 5, 5, 12, 0, 0);
    const failed = recordFailure(base, now);
    expect(failed.failureCount).toBe(1);
    expect(failed.lockedUntil).toBe(new Date(now + 1000).toISOString());
    const ok = recordSuccess(failed, now);
    expect(ok.failureCount).toBe(0);
    expect(ok.lockedUntil).toBeUndefined();
  });
});

describe('recovery codes', () => {
  it('generates well-formed grouped codes', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  });

  it('normalises user formatting forgivingly', () => {
    expect(normalizeCode(' k7p2q-9mr4t ')).toBe('K7P2Q9MR4T');
  });

  it('consumes a code once and removes only that hash', async () => {
    const hasher = new FakePasswordHasher();
    const { plaintext, hashes } = await generateRecoveryCodes(hasher, 3);
    expect(hashes).toHaveLength(3);

    const target = plaintext[1] as string;
    const first = await consumeRecoveryCode(hasher, target, hashes);
    expect(first).not.toBeNull();
    expect(first?.remaining).toHaveLength(2);

    // The same code can't be consumed again from the reduced set.
    const second = await consumeRecoveryCode(hasher, target, first?.remaining ?? []);
    expect(second).toBeNull();
  });

  it('rejects an unknown code', async () => {
    const hasher = new FakePasswordHasher();
    const { hashes } = await generateRecoveryCodes(hasher, 2);
    expect(await consumeRecoveryCode(hasher, 'ZZZZZ-ZZZZZ', hashes)).toBeNull();
  });
});

describe('TOTP enroll + verify', () => {
  const env = makeTestEnv();
  const sealer = new FakeSecretSealer();

  it('enrolls and verifies a freshly generated code', () => {
    const enrollment = enrollTotp(env, sealer);
    expect(enrollment.otpauthUri).toContain('otpauth://totp/');
    expect(enrollment.base32Secret.length).toBeGreaterThan(0);

    // Derive the live code from the same base32 secret the enrollment exposed,
    // using identical params (SHA1/6/30) → verifyTotp must accept it.
    const live = new TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(enrollment.base32Secret),
    }).generate();
    expect(verifyTotp(env, sealer, enrollment.encryptedSecret, live)).toBe(true);

    // A wrong fixed code is rejected.
    const wrong = live === '000000' ? '111111' : '000000';
    expect(verifyTotp(env, sealer, enrollment.encryptedSecret, wrong)).toBe(false);
  });

  it('rejects malformed tokens without throwing', () => {
    const enrollment = enrollTotp(env, sealer);
    expect(verifyTotp(env, sealer, enrollment.encryptedSecret, 'abc')).toBe(false);
    expect(verifyTotp(env, sealer, enrollment.encryptedSecret, '12345')).toBe(false);
  });
});

describe('admin-store bootstrap gate', () => {
  it('isProvisioned requires at least one passkey', () => {
    const empty = emptyAdmin('2026-06-05T00:00:00.000Z');
    expect(isProvisioned(empty)).toBe(false);
    expect(isProvisioned(null)).toBe(false);
    const withKey = {
      ...empty,
      webauthnCredentials: [
        { credentialId: 'c', publicKey: 'k', counter: 0, label: 'l', createdAt: 'now' },
      ],
    };
    expect(isProvisioned(withKey)).toBe(true);
  });

  it('allows registration only at bootstrap or with a session', () => {
    const empty = emptyAdmin('2026-06-05T00:00:00.000Z');
    const withKey = provisioned();
    // No admin yet → bootstrap allowed regardless of session.
    expect(mayRegister(null, false)).toBe(true);
    expect(mayRegister(empty, false)).toBe(true);
    // Provisioned → only with a session.
    expect(mayRegister(withKey, false)).toBe(false);
    expect(mayRegister(withKey, true)).toBe(true);
  });
});

describe('evaluateRegistration — bootstrap token gate', () => {
  const TOKEN = 'a-strong-setup-token-1234'; // pragma: allowlist secret

  it('provisioned + session → allowed, not bootstrap (token irrelevant)', () => {
    const env = makeTestEnv({ ADMIN_SETUP_TOKEN: TOKEN });
    expect(evaluateRegistration(env, provisioned(), true, undefined)).toEqual({
      allowed: true,
      bootstrap: false,
    });
  });

  it('provisioned + no session → denied (session_required), even with a token', () => {
    const env = makeTestEnv({ ADMIN_SETUP_TOKEN: TOKEN });
    expect(evaluateRegistration(env, provisioned(), false, TOKEN)).toEqual({
      allowed: false,
      reason: 'session_required',
    });
  });

  it('unprovisioned + correct token → allowed bootstrap', () => {
    const env = makeTestEnv({ ADMIN_SETUP_TOKEN: TOKEN });
    expect(evaluateRegistration(env, null, false, TOKEN)).toEqual({
      allowed: true,
      bootstrap: true,
    });
  });

  it('unprovisioned + wrong/missing token (token configured) → denied bad_setup_token', () => {
    const env = makeTestEnv({ ADMIN_SETUP_TOKEN: TOKEN });
    expect(evaluateRegistration(env, null, false, 'wrong')).toEqual({
      allowed: false,
      reason: 'bad_setup_token',
    });
    expect(evaluateRegistration(env, null, false, undefined)).toEqual({
      allowed: false,
      reason: 'bad_setup_token',
    });
  });

  it('unprovisioned + token UNSET in production → fail closed (setup_disabled)', () => {
    const env = makeTestEnv({ NODE_ENV: 'production' });
    delete (env as { ADMIN_SETUP_TOKEN?: string }).ADMIN_SETUP_TOKEN;
    expect(evaluateRegistration(env, null, false, undefined)).toEqual({
      allowed: false,
      reason: 'setup_disabled',
    });
  });

  it('unprovisioned + token UNSET in dev/test → allowed (local convenience)', () => {
    const env = makeTestEnv(); // NODE_ENV 'test', no token
    expect(evaluateRegistration(env, null, false, undefined)).toEqual({
      allowed: true,
      bootstrap: true,
    });
  });

  it('UNPROVISIONED + session + no token → DENIED (closes stolen-session→reset→re-register hole)', () => {
    const env = makeTestEnv({ ADMIN_SETUP_TOKEN: TOKEN });
    // A session must NOT substitute for the token on the unprovisioned (post-reset)
    // path: otherwise a stolen session that triggered a factory reset could
    // re-register an attacker passkey with no token.
    expect(evaluateRegistration(env, null, true, undefined)).toEqual({
      allowed: false,
      reason: 'bad_setup_token',
    });
    // Even with a session, an unprovisioned account in prod with no token fails closed.
    const prod = makeTestEnv({ NODE_ENV: 'production' });
    delete (prod as { ADMIN_SETUP_TOKEN?: string }).ADMIN_SETUP_TOKEN;
    expect(evaluateRegistration(prod, null, true, undefined)).toEqual({
      allowed: false,
      reason: 'setup_disabled',
    });
  });

  it('recovery path is unaffected: PROVISIONED account + recovery session → allowed via session branch', () => {
    const env = makeTestEnv({ ADMIN_SETUP_TOKEN: TOKEN });
    // Recovery leaves passkey records on the account (never clears them), so a
    // post-recovery account is provisioned and registers via the session branch
    // with no token — the documented recovery→register flow still works.
    expect(evaluateRegistration(env, provisioned(), true, undefined)).toEqual({
      allowed: true,
      bootstrap: false,
    });
  });

  it('token comparison is exact (no prefix/length leniency)', () => {
    const env = makeTestEnv({ ADMIN_SETUP_TOKEN: TOKEN });
    expect(evaluateRegistration(env, null, false, TOKEN + 'x').allowed).toBe(false);
    expect(evaluateRegistration(env, null, false, TOKEN.slice(0, -1)).allowed).toBe(false);
  });
});
