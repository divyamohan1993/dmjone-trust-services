/**
 * Brute-force defence for admin authentication.
 *
 * Resolves a real requirement tension (spec §6 "permanent lockout after 10
 * fails" vs §1/§11 "lockout-proof"): a *global permanent* counter would let an
 * unauthenticated attacker brick the sole admin with a handful of POSTs — the
 * opposite of lockout-proof. So only the *guessable* factor is locked:
 *
 *   - Recovery-code + TOTP failures → the only brute-forceable path; these back
 *     off AND permanently lock after `MAX_AUTH_FAILURES`, per the super-admin
 *     standard (unlock = reinstall). This module governs exactly that path; the
 *     recovery route checks {@link evaluateLock} before any Argon2 work and
 *     calls {@link recordFailure}/{@link recordSuccess}.
 *   - Passkey auth failures are DELIBERATELY NOT rate-limited at the app layer
 *     and are exempt from this lock: passkeys are unforgeable, so locking on
 *     them would be pure attacker-gifted DoS, and writing `adminRepo` on every
 *     unauthenticated passkey miss would itself be a write-amplification vector.
 *     The volumetric shield for `/login/*` is Cloudflare at the edge. A passkey
 *     holder therefore always bypasses this lock — which is what makes the
 *     system lockout-proof: a recovery-path attacker who trips the permanent
 *     lock can never brick the genuine passkey-holding admin.
 *
 * `failureCount` and `lockedUntil` live on the `AdminAccount`. "Permanent" is
 * encoded as `failureCount >= MAX_AUTH_FAILURES` (no sentinel field needed).
 */

import type { AdminAccount } from '@dmjone/shared';

/** Backoff ceiling: 1 hour, per the super-admin standard. */
export const MAX_BACKOFF_MS = 60 * 60 * 1000;

/**
 * Exponential backoff for the Nth consecutive failure: 1s, 2s, 4s, … capped at
 * 1h. Pure + deterministic so it can be unit-tested. `failureCount` is the
 * number of failures *already* recorded (0 ⇒ no delay yet).
 */
export function backoffMs(failureCount: number): number {
  if (failureCount <= 0) return 0;
  // 2^(n-1) seconds; clamp the exponent so the shift can't overflow.
  const exp = Math.min(failureCount - 1, 30);
  const ms = 2 ** exp * 1000;
  return Math.min(ms, MAX_BACKOFF_MS);
}

export type LockState =
  | { locked: false }
  | { locked: true; permanent: true }
  | { locked: true; permanent: false; retryAfterMs: number };

/**
 * Evaluate the current lock state for the guessable (recovery+TOTP) path.
 * @param now epoch ms (injectable for tests).
 */
export function evaluateLock(account: AdminAccount, maxFailures: number, now: number): LockState {
  if (account.failureCount >= maxFailures) {
    return { locked: true, permanent: true };
  }
  if (account.lockedUntil) {
    const until = Date.parse(account.lockedUntil);
    if (Number.isFinite(until) && until > now) {
      return { locked: true, permanent: false, retryAfterMs: until - now };
    }
  }
  return { locked: false };
}

/**
 * Apply a failed guessable-path attempt: bump the counter and set the next
 * `lockedUntil` from the new count. Returns the mutated copy (caller persists).
 */
export function recordFailure(account: AdminAccount, now: number): AdminAccount {
  const failureCount = account.failureCount + 1;
  const lockedUntil = new Date(now + backoffMs(failureCount)).toISOString();
  return { ...account, failureCount, lockedUntil, updatedAt: new Date(now).toISOString() };
}

/** Apply a successful auth: clear the counter and any temporary lock. */
export function recordSuccess(account: AdminAccount, now: number): AdminAccount {
  const cleared: AdminAccount = { ...account, failureCount: 0, updatedAt: new Date(now).toISOString() };
  delete cleared.lockedUntil;
  return cleared;
}
