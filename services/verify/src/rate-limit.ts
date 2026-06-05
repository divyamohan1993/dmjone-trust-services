/**
 * A tiny in-memory rate limiter with exponential backoff, used to throttle the
 * password-gated download endpoint against brute force.
 *
 * Per the super-admin standard: failed attempts grow the lockout window
 * exponentially (1s → 2s → 4s → … capped), and the rejection is *cheap* (a map
 * lookup, no Argon2id, no DB) so it absorbs hostile traffic without burning the
 * expensive verification path. The clock is injectable so backoff is testable
 * without sleeping.
 *
 * Scope: a single Cloud Run instance. This is a first cheap line of defence
 * layered under Cloudflare's edge WAF/rate-limiting (the real DDoS shield);
 * it is not a distributed limiter and is not meant to be one.
 */

export interface RateLimiterOptions {
  /** Failures allowed before backoff kicks in. */
  threshold: number;
  /** First backoff window, ms. Doubles per failure beyond the threshold. */
  baseMs: number;
  /** Upper bound on a single backoff window, ms. */
  capMs: number;
  /** Idle time after which a key's counters are forgotten, ms. */
  windowMs: number;
  /** Monotonic-ish clock; defaults to Date.now. Injected in tests. */
  now: () => number;
}

interface Entry {
  failures: number;
  /** Epoch ms before which the key is blocked; 0 = not blocked. */
  blockedUntil: number;
  lastSeen: number;
}

export interface RateDecision {
  blocked: boolean;
  /** Seconds the caller should wait, when blocked (for Retry-After). */
  retryAfterSeconds: number;
}

const DEFAULTS: Omit<RateLimiterOptions, 'now'> = {
  threshold: 5,
  baseMs: 1_000,
  capMs: 60 * 60 * 1_000, // 1 hour
  windowMs: 60 * 60 * 1_000,
};

export class RateLimiter {
  private readonly opts: RateLimiterOptions;
  private readonly entries = new Map<string, Entry>();

  constructor(opts: Partial<RateLimiterOptions> = {}) {
    this.opts = { ...DEFAULTS, now: Date.now, ...opts };
  }

  /** Check (without mutating failure count) whether a key is currently blocked. */
  check(key: string): RateDecision {
    const now = this.opts.now();
    const entry = this.entries.get(key);
    if (!entry) return { blocked: false, retryAfterSeconds: 0 };
    if (now - entry.lastSeen > this.opts.windowMs) {
      this.entries.delete(key);
      return { blocked: false, retryAfterSeconds: 0 };
    }
    if (entry.blockedUntil > now) {
      return {
        blocked: true,
        retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000),
      };
    }
    return { blocked: false, retryAfterSeconds: 0 };
  }

  /** Record a failed attempt and compute the next backoff window. */
  recordFailure(key: string): RateDecision {
    const now = this.opts.now();
    const entry = this.entries.get(key) ?? { failures: 0, blockedUntil: 0, lastSeen: now };
    entry.failures += 1;
    entry.lastSeen = now;
    if (entry.failures >= this.opts.threshold) {
      const overage = entry.failures - this.opts.threshold; // 0,1,2,...
      const backoff = Math.min(this.opts.baseMs * 2 ** overage, this.opts.capMs);
      entry.blockedUntil = now + backoff;
    }
    this.entries.set(key, entry);
    if (entry.blockedUntil > now) {
      return { blocked: true, retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000) };
    }
    return { blocked: false, retryAfterSeconds: 0 };
  }

  /** Clear a key's counters after a legitimate success. */
  reset(key: string): void {
    this.entries.delete(key);
  }
}
