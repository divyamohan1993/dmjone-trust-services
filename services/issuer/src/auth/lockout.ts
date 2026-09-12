/** Recovery guesses use exponential cooldowns, never an irreversible lock.
 * At the configured threshold, each failure imposes at least one hour.
 * Passkey authentication remains independent of this cooldown.
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
  | { locked: true; permanent: false; retryAfterMs: number };

/**
 * Evaluate the current lock state for the guessable (recovery+TOTP) path.
 * @param now epoch ms (injectable for tests).
 */
export function evaluateLock(account: AdminAccount, maxFailures: number, now: number): LockState {
  const explicitUntil = Date.parse(account.lockedUntil ?? '');
  // Legacy permanently locked accounts become usable one hour after their last
  // update; malformed timestamps fail closed for this request.
  const thresholdUntil = account.failureCount >= maxFailures
    ? Date.parse(account.updatedAt) + MAX_BACKOFF_MS : 0;
  const until = Math.max(Number.isFinite(explicitUntil) ? explicitUntil : 0,
    Number.isFinite(thresholdUntil) ? thresholdUntil : now + MAX_BACKOFF_MS);
  if (until > now) return { locked: true, permanent: false, retryAfterMs: until - now };
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
