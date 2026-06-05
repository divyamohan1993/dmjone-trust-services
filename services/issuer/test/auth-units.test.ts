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
import { emptyAdmin, isProvisioned, mayRegister } from '../src/auth/admin-store.js';
import { FakePasswordHasher, FakeSecretSealer, makeTestEnv } from './fakes.js';

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
    const provisioned = {
      ...empty,
      webauthnCredentials: [
        { credentialId: 'c', publicKey: 'k', counter: 0, label: 'l', createdAt: 'now' },
      ],
    };
    // No admin yet → bootstrap allowed regardless of session.
    expect(mayRegister(null, false)).toBe(true);
    expect(mayRegister(empty, false)).toBe(true);
    // Provisioned → only with a session.
    expect(mayRegister(provisioned, false)).toBe(false);
    expect(mayRegister(provisioned, true)).toBe(true);
  });
});
